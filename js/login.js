/* ============================================================
   Knowledge – login / sign-up page logic
   ============================================================ */

(function () {
  const params = new URLSearchParams(location.search);
  const next = Auth.safeNext(params.get("next"));

  // Already signed in? Skip the form.
  if (Auth.getUser()) {
    location.replace(next);
    return;
  }

  const $ = (id) => document.getElementById(id);
  const forms = { signin: $("signinForm"), signup: $("signupForm") };
  const tabs = { signin: $("tabSignin"), signup: $("tabSignup") };

  const COPY = {
    signin: {
      title: "Welcome back",
      sub: "Sign in to continue to your resources.",
      switchHtml: 'New to Knowledge? <a href="#" id="switchLink">Create an account</a>',
      pageTitle: "Sign in | Knowledge",
    },
    signup: {
      title: "Create your account",
      sub: "Create your account and choose your grade and subjects.",
      switchHtml: 'Already have an account? <a href="#" id="switchLink">Sign in</a>',
      pageTitle: "Create account | Knowledge",
    },
  };

  let mode = "signin";

  function setMode(newMode, focus) {
    mode = newMode;
    Object.keys(forms).forEach(function (key) {
      forms[key].hidden = key !== mode;
      tabs[key].classList.toggle("selected", key === mode);
      tabs[key].setAttribute("aria-selected", key === mode ? "true" : "false");
    });
    $("authTitle").textContent = COPY[mode].title;
    $("authSub").textContent = COPY[mode].sub;
    $("authSwitch").innerHTML = COPY[mode].switchHtml;
    $("switchLink").addEventListener("click", switchHandler);
    document.title = COPY[mode].pageTitle;
    clearErrors();
    if (focus) (mode === "signin" ? $("siEmail") : $("suName")).focus();
  }

  function switchHandler(e) {
    e.preventDefault();
    setMode(mode === "signin" ? "signup" : "signin", true);
  }

  tabs.signin.addEventListener("click", () => setMode("signin", true));
  tabs.signup.addEventListener("click", () => setMode("signup", true));
  $("switchLink").addEventListener("click", switchHandler);

  /* ---------- context notice ---------- */
  (function showNotice() {
    const action = params.get("action");
    const title = params.get("title");
    const verbs = { download: "download", view: "review", read: "read", watch: "watch" };
    if (!action || !verbs[action]) return;
    const text = title ? "Sign in to " + verbs[action] + " “" + title + "”." : "Sign in to " + verbs[action] + " this resource.";
    $("authNoticeText").textContent = text;
    $("authNotice").hidden = false;
    lucide.createIcons();
  })();

  /* ---------- validation helpers ---------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function setError(inputId, message) {
    const input = $(inputId);
    const err = $(inputId + "Error");
    if (err) err.textContent = message || "";
    const wrap = input.closest(".input-wrap");
    if (wrap) wrap.classList.toggle("invalid", !!message);
    input.setAttribute("aria-invalid", message ? "true" : "false");
    return !message;
  }

  function clearErrors() {
    document.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
    document.querySelectorAll(".input-wrap.invalid").forEach((el) => el.classList.remove("invalid"));
    document.querySelectorAll(".subject-choice-group.invalid").forEach((el) => el.classList.remove("invalid"));
    document.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.setAttribute("aria-invalid", "false"));
  }

  const validators = {
    email: (v) => (!v.trim() ? "Enter your email address." : !EMAIL_RE.test(v.trim()) ? "Enter a valid email, like name@example.com." : ""),
    name: (v) => (v.trim().length < 2 ? "Enter your full name." : ""),
    grade: (v) => (!v ? "Choose your grade." : ""),
    newPassword: (v) =>
      v.length < 8 ? "Use at least 8 characters." : !/[A-Za-z]/.test(v) || !/\d/.test(v) ? "Include at least one letter and one number." : "",
    password: (v) => (!v ? "Enter your password." : ""),
  };

  // Validate a field when the user leaves it, and clear its error as they fix it
  [
    ["siEmail", "email"], ["siPassword", "password"],
    ["suName", "name"], ["suEmail", "email"], ["suGrade", "grade"], ["suPassword", "newPassword"],
  ].forEach(function (pair) {
    const input = $(pair[0]);
    input.addEventListener("blur", () => input.value && setError(pair[0], validators[pair[1]](input.value)));
    input.addEventListener("input", function () {
      if ($(pair[0] + "Error").textContent) setError(pair[0], validators[pair[1]](input.value));
    });
  });

  $("subjectChoiceGroup").addEventListener("change", function () {
    if (document.querySelector('#subjectChoiceGroup input:checked')) {
      $("suSubjectsError").textContent = "";
      $("subjectChoiceGroup").classList.remove("invalid");
      $("subjectChoiceGroup").setAttribute("aria-invalid", "false");
    }
  });

  /* ---------- show / hide password ---------- */
  document.querySelectorAll(".toggle-pass").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const input = $(btn.dataset.target);
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      btn.innerHTML = '<i data-lucide="' + (show ? "eye-off" : "eye") + '"></i>';
      lucide.createIcons();
    });
  });

  /* ---------- forgot password ---------- */
  $("forgotLink").addEventListener("click", function (e) {
    e.preventDefault();
    notify("Password reset needs a server. It is not available in this demo.");
  });

  /* ---------- submit ---------- */
  function busy(button, isBusy, label) {
    button.disabled = isBusy;
    button.textContent = isBusy ? "Please wait…" : label;
  }

  function finish(message) {
    Auth.setWelcome(message);
    location.href = next;
  }

  forms.signin.addEventListener("submit", async function (e) {
    e.preventDefault();
    const email = $("siEmail").value;
    const password = $("siPassword").value;
    const okEmail = setError("siEmail", validators.email(email));
    const okPass = setError("siPassword", validators.password(password));
    if (!okEmail || !okPass) return;

    const btn = $("siSubmit");
    busy(btn, true, "Sign in");
    const result = await Auth.signIn(email, password, $("siRemember").checked);
    busy(btn, false, "Sign in");

    if (!result.ok) {
      setError(result.field === "email" ? "siEmail" : "siPassword", result.message);
      $(result.field === "email" ? "siEmail" : "siPassword").focus();
      return;
    }
    finish("Welcome back, " + Auth.getUser().name.split(/\s+/)[0]);
  });

  forms.signup.addEventListener("submit", async function (e) {
    e.preventDefault();
    const name = $("suName").value;
    const email = $("suEmail").value;
    const password = $("suPassword").value;
    const grade = $("suGrade").value;
    const subjects = Array.from(document.querySelectorAll('#subjectChoiceGroup input[name="suSubjects"]:checked')).map((input) => input.value);
    const results = [
      setError("suName", validators.name(name)),
      setError("suEmail", validators.email(email)),
      setError("suGrade", validators.grade(grade)),
      setError("suPassword", validators.newPassword(password)),
    ];
    const subjectsValid = subjects.length > 0;
    $("suSubjectsError").textContent = subjectsValid ? "" : "Choose at least one subject.";
    $("subjectChoiceGroup").classList.toggle("invalid", !subjectsValid);
    $("subjectChoiceGroup").setAttribute("aria-invalid", String(!subjectsValid));
    if (results.includes(false) || !subjectsValid) {
      const firstBad = document.querySelector('#signupForm .input-wrap.invalid input, #signupForm [aria-invalid="true"]:not(fieldset), #signupForm .subject-choice-group.invalid input');
      if (firstBad) firstBad.focus();
      return;
    }

    const btn = $("suSubmit");
    busy(btn, true, "Create account");
    const result = await Auth.signUp(name, email, password, grade, subjects);
    busy(btn, false, "Create account");

    if (!result.ok) {
      setError("suEmail", result.message);
      $("suEmail").focus();
      return;
    }
    finish("Account created. Welcome, " + name.trim().split(/\s+/)[0]);
  });

  if (params.get("mode") === "signup") setMode("signup", false);
})();

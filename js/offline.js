(function () {
  "use strict";
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./service-worker.js").catch(function (error) {
        console.warn("Offline support could not be enabled:", error);
      });
    });
  }
})();

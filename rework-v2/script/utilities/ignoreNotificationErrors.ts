export const ignoreNotificationErrors = () => {
  const assembly = Il2Cpp.domain.assembly("Assembly-CSharp").image;

  assembly.class("ErrorHandling").method("Throw").implementation = function (
    incident
  ) {
    if (incident.toString().includes("988853616")) {
      return;
    }
    return this.method("Throw").invoke(incident);
  };
};

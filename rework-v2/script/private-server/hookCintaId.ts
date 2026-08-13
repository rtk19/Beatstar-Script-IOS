import fs from "frida-fs";
import Device from "../lib/Device";

/**
 * Reads a cinta ID from the user file to authenticate a user.
 */
export const hookCintaId = () => {
  const loginRuntime = Il2Cpp.domain.assembly("SpaceApe.Login.Runtime").image;

  console.log("hooked cinta");

  loginRuntime.class("CintaProvider").method("Populate").implementation =
    function (command) {
      this.method("Populate").invoke(command);
      const user = Il2Cpp.string(
        fs.readFileSync(Device.documents("user")).toString().trim()
      );
      command.field("Cinta").value = user;
    };
};

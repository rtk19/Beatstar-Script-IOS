import Logger from "../lib/Logger";

export const lengthFixer = () => {
  const coreModule = Il2Cpp.domain.assembly("UnityEngine.CoreModule").image;
  const mscorlib = Il2Cpp.domain.assembly("mscorlib").image;
  const assembly = Il2Cpp.domain.assembly("Assembly-CSharp").image;

  coreModule.class("UnityEngine.TextAsset").method("get_bytes").implementation =
    function () {
      let name = this.method("get_name").invoke() as Il2Cpp.String;
      let data = this.method("get_bytes").invoke() as Il2Cpp.Array;

      if (name.toString() == '"music_metadata"') {
        try {

          const bytes = Array.from(data);
          const hexString = bytes.map(b => b.toString(16).padStart(2, '0')).join('');


          const modifiedHex = hexString
            .replace(/615555d547220041/g, '00000000882a7141')
            .replace(/565555d547220041/g, '00000000882a7141');


          const newBytes = new Array(modifiedHex.length / 2);
          for (let i = 0; i < modifiedHex.length; i += 2) {
            newBytes[i/2] = parseInt(modifiedHex.substr(i, 2), 16);
          }


          const byteArrayClass = mscorlib.class("System.Byte");
          const newArray = Il2Cpp.array(byteArrayClass, newBytes.length);
          for (let i = 0; i < newBytes.length; i++) {
            newArray.set(i, newBytes[i]);
          }

          return newArray;
        } catch (e) {
          Logger.log(`[LengthFixer] Error in byte manipulation: ${e}`);
          return data;
        }
      }
      return data;
    };
};

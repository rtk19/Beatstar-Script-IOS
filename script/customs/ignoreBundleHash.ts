/**
 * Kills the hashing code so all our bundles are considered valid
 */
export const ignoreBundleHash = () => {
  const assembly = Il2Cpp.domain.assembly(
    "UnityEngine.UnityWebRequestAssetBundleModule"
  ).image;

  const core = Il2Cpp.domain.assembly("UnityEngine.CoreModule").image;

  assembly
    .class("UnityEngine.Networking.UnityWebRequestAssetBundle")
    .method("GetAssetBundle")
    .overload(
      "System.String",
      "UnityEngine.Hash128",
      "System.UInt32"
    ).implementation = function (uri: any, origHash: any, crc: any) {
    const genHash = (size: number) =>
      [...Array(size)]
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join("");
    const hash = Il2Cpp.string(genHash(36));

    if (uri.toString().includes("file://")) {
      let res = this.method("GetAssetBundle")
        .overload("System.String", "UnityEngine.Hash128", "System.UInt32")
        .invoke(
          uri,
          core.class("UnityEngine.Hash128").method("Parse").invoke(hash),
          0
        );

      return res;
    }
    return this.method("GetAssetBundle")
      .overload("System.String", "UnityEngine.Hash128", "System.UInt32")
      .invoke(uri, origHash, crc);
  };
};

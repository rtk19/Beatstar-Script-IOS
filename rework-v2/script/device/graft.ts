/**
 * Prints an output log file of all the functions and methods to be used with the build script
 * to auto graft IPA's
 *
 * Pipe this out as you run it. frida -U Beatstar -l script.js > out.txt
 */

// @ts-nocheck

import "frida-il2cpp-bridge";

const list = {};

Il2Cpp.perform(() => {
  for (const assembly of Il2Cpp.domain.assemblies) {
    for (const klass of assembly.image.classes) {
      list[klass.name] = [];
      for (const method of klass.methods) {
        list[klass.name].push({
          name: method.name,
          address: method.relativeVirtualAddress,
          parameterCount: method.parameterCount,
        });
      }
    }
  }
  console.log(JSON.stringify(list));
});

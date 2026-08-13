const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const scriptRoot = __dirname;

/**
 * Crypto isn't supported without a shim so we'll use xor encoding instead
 * This function encodes and decodes a string. Running it on an encoded string
 * will return the unencoded version.
 */
const xor = (data) => {
  const str = data.split("");

  const xorKey = "bf3c199c2470cb477d907b1e0917c17b";

  for (let i = 0; i < str.length; i++) {
    str[i] = String.fromCharCode(str[i].charCodeAt(0) ^ xorKey.charCodeAt(0));
  }
  return str.join("");
};

async function build(entryPoint, outfile, prod) {
  await esbuild.build({
    absWorkingDir: scriptRoot,
    entryPoints: [entryPoint],
    bundle: true,
    outfile,
    minify: prod,
    plugins: [shim],
  });
}

/**
 * ESBuild doesn't natively support these like frida-compile so we need to specify them here
 * The -node flag doesn't work for this
 */
let shim = {
  name: "shim",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      const shims = [
        { name: "buffer", entry: "@frida/buffer/index.js" },
        { name: "http", entry: "@frida/http/index.js" },
        { name: "events", entry: "@frida/events/events.js" },
        { name: "net", entry: "@frida/net/index.js" },
        { name: "util", entry: "@frida/util/util.js" },
        { name: "stream", entry: "@frida/stream/index.js" },
        { name: "assert", entry: "@frida/assert/assert.js" },
        { name: "process", entry: "@frida/process/index.js" },
        {
          name: "string_decoder",
          entry: "@frida/string_decoder/lib/string_decoder.js",
        },
        { name: "path", entry: "@frida/path/index.js" },
        { name: "timers", entry: "@frida/timers/index.js" },
        { name: "url", entry: "@frida/url/url.js" },
        { name: "crypto", entry: "crypto-browserify/index.js" },
      ];
      const shim = shims.find((el) => el.name == args.path);
      if (shim) {
        return {
          path: `${__dirname}/node_modules/${shim.entry}`,
          namespace: "file",
        };
      }
    });
  },
};

/**
 * Something in the assert library is broken so we need to do some patching here.
 * - assert2 in the non minified file is undefined to we comment out those asserts
 * - in the minified file we add an empty OK function to the exported assert object
 */
async function run() {
  const prod = process.argv.includes("-prod");
  const test = process.argv.includes("-test");
  const agent = process.argv.includes("-agent");
  const outfileArgumentIndex = process.argv.indexOf("--outfile");
  const requestedEntry = process.argv.slice(2).find((argument, index, args) => {
    if (argument.startsWith("-")) return false;
    return index === 0 || args[index - 1] !== "--outfile";
  });
  const entryPoint = path.resolve(
    scriptRoot,
    requestedEntry ||
      (test ? "test/test.ts" : agent ? "agent/agent.ts" : "device/device.ts")
  );
  const outfile = path.resolve(
    scriptRoot,
    outfileArgumentIndex === -1
      ? "file.js"
      : process.argv[outfileArgumentIndex + 1]
  );

  if (!fs.existsSync(entryPoint)) {
    throw new Error(`Entry point does not exist: ${entryPoint}`);
  }

  await fs.promises.mkdir(path.dirname(outfile), { recursive: true });
  await build(entryPoint, outfile, prod);
  let file = fs
    .readFileSync(outfile)
    .toString()
    .replaceAll(
      "bo.HTTPParser=T",
      "go.ok=function(){return true;};go.equal=function(){return true;};bo.HTTPParser=T"
    )
    .split("\n");
  for (var i = 0; i < file.length; i++) {
    const line = file[i].trim();
    if (line.startsWith("exports.HTTPParser = HTTPParser2;")) {
      file[i] =
        "assert2.ok=function(){return true;};assert2.equal=function(){return true;};" +
        line;
    }
  }

  if (prod) {
    const write = prod ? xor(file.join("\n")) : file.join("\n");
    fs.writeFileSync(outfile, Buffer.from(write).toString("base64"));
  } else {
    fs.writeFileSync(outfile, file.join("\n"));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

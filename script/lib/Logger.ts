import ObjC from "frida-objc-bridge";

class Logger {
  private sequence = 0;

  constructor() {
    this.createLogFile();
  }
  createLogFile() {
    var documentsFolder =
      ObjC.classes.NSProcessInfo.processInfo()
        .environment()
        .objectForKey_("HOME")
        .toString() + "/Documents/log.txt";
    var fileManager = ObjC.classes.NSFileManager.defaultManager();

    if (fileManager.fileExistsAtPath_(documentsFolder)) {
      var errorPtr = Memory.alloc(Process.pointerSize);
      errorPtr.writePointer(NULL);
      try {
        fileManager.removeItemAtPath_error_(documentsFolder, errorPtr);
      } catch (error) {
        console.log("Error deleting log.txt: " + error);
      }
    }
    fileManager.createFileAtPath_contents_attributes_(
      documentsFolder,
      null,
      null
    );
  }

  log(message: string) {
    var documentsFolder =
      ObjC.classes.NSProcessInfo.processInfo()
        .environment()
        .objectForKey_("HOME")
        .toString() + "/Documents/log.txt";
    var fileHandle =
      ObjC.classes.NSFileHandle.fileHandleForUpdatingAtPath_(documentsFolder);
    fileHandle.seekToEndOfFile();
    const timestamp = new Date().toISOString();
    const line = `[${String(++this.sequence).padStart(4, "0")}] ${timestamp} ${message}`;
    var string = ObjC.classes.NSString.stringWithString_(line + "\n");
    var data = string.dataUsingEncoding_(4);
    fileHandle.writeData_(data);
    fileHandle.closeFile();

    try {
      console.log(line);
    } catch (_) {}
  }
}

export default new Logger();

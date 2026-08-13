class Logger {
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
    console.log(message);
    var documentsFolder =
      ObjC.classes.NSProcessInfo.processInfo()
        .environment()
        .objectForKey_("HOME")
        .toString() + "/Documents/log.txt";
    var fileManager = ObjC.classes.NSFileManager.defaultManager();
    var fileHandle =
      ObjC.classes.NSFileHandle.fileHandleForUpdatingAtPath_(documentsFolder);
    fileHandle.seekToEndOfFile();
    var string = ObjC.classes.NSString.stringWithString_(message + "\n");
    var data = string.dataUsingEncoding_(4);
    fileHandle.writeData_(data);
    fileHandle.closeFile();
  }
}

export default new Logger();

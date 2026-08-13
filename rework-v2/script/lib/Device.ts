import Logger from "./Logger";

interface AlertOptions {
  title?: string;
  message: string;
  buttonTitle?: string;
  style?: number;
}

class Device {
  static toast(message: string, durationMs = 3000) {
    const tryShow = (attempt: number) => {
      ObjC.schedule(ObjC.mainQueue, () => {
        try {
          const UIApplication = ObjC.classes.UIApplication;
          const UIWindowScene = ObjC.classes.UIWindowScene;
          const UILabel = ObjC.classes.UILabel;
          const UIColor = ObjC.classes.UIColor;
          const UIFont = ObjC.classes.UIFont;

          const scenes = UIApplication.sharedApplication()
            .connectedScenes()
            .allObjects();
          if (scenes.count() === 0) throw new Error("no connected scene");

          const windowScene = scenes.objectAtIndex_(0);
          if (!windowScene.isKindOfClass_(UIWindowScene.class())) {
            throw new Error("connected scene is not a window scene");
          }

          const windows = windowScene.windows();
          let keyWindow = null;
          for (let index = 0; index < windows.count(); index++) {
            const candidate = windows.objectAtIndex_(index);
            if (candidate.isKeyWindow()) {
              keyWindow = candidate;
              break;
            }
          }
          if (!keyWindow) keyWindow = windows.firstObject();
          if (!keyWindow) throw new Error("no app window");

          const bounds = keyWindow.bounds();
          const screenWidth = Number(bounds.size.width);
          const width = Math.min(screenWidth - 40, 320);
          const height = 48;
          const toast = UILabel.alloc().initWithFrame_({
            origin: { x: (screenWidth - width) / 2, y: 58 },
            size: { width, height },
          });

          toast.setText_(message);
          toast.setTextAlignment_(1);
          toast.setTextColor_(UIColor.whiteColor());
          toast.setBackgroundColor_(UIColor.colorWithWhite_alpha_(0, 0.82));
          toast.setFont_(UIFont.boldSystemFontOfSize_(16));
          toast.setNumberOfLines_(1);
          toast.layer().setCornerRadius_(12);
          toast.layer().setMasksToBounds_(true);
          toast.setUserInteractionEnabled_(false);
          keyWindow.addSubview_(toast);

          setTimeout(() => {
            ObjC.schedule(ObjC.mainQueue, () => {
              try {
                toast.removeFromSuperview();
              } catch (error) {
                Logger.log(`[Device] Could not dismiss toast: ${error}`);
              }
            });
          }, durationMs);
        } catch (error) {
          if (attempt < 10) {
            setTimeout(() => tryShow(attempt + 1), 100);
          } else {
            Logger.log(`[Device] Could not show toast: ${error}`);
          }
        }
      });
    };

    tryShow(0);
  }

  static alert(options: AlertOptions | string) {
    const config = typeof options === "string" ? { message: options } : options;

    const handler = new ObjC.Block({
      retType: "void",
      argTypes: ["object"],
      implementation() {},
    });

    ObjC.schedule(ObjC.mainQueue, () => {
      const UIApplication = ObjC.classes.UIApplication;
      const UIWindowScene = ObjC.classes.UIWindowScene;
      const UIAlertController = ObjC.classes.UIAlertController;
      const UIAlertAction = ObjC.classes.UIAlertAction;

      const windowScene = UIApplication.sharedApplication()
        .connectedScenes()
        .allObjects()
        .objectAtIndex_(0);

      const keyWindow = windowScene.windows().firstObject();
      let viewController = keyWindow.rootViewController();

      // Get the topmost presented view controller
      while (viewController.presentedViewController()) {
        viewController = viewController.presentedViewController();
      }

      const alert =
        UIAlertController.alertControllerWithTitle_message_preferredStyle_(
          config.title || null,
          config.message,
          1
        );

      const defaultAction = UIAlertAction.actionWithTitle_style_handler_(
        config.buttonTitle || "OK",
        config.style || 0,
        handler
      );

      alert.addAction_(defaultAction);
      viewController.presentViewController_animated_completion_(
        alert,
        true,
        null
      );
    });
  }

  static documents(path?: string): string {
    const basePath =
      ObjC.classes.NSProcessInfo.processInfo()
        .environment()
        .objectForKey_("HOME")
        .toString() + "/Documents/";

    return path ? basePath + path : basePath;
  }

  static getDeviceLanguage(): string {
    try {
      const NSLocale = ObjC.classes.NSLocale;
      const currentLocale = NSLocale.currentLocale();
      const languageCode = currentLocale.languageCode();
      return languageCode.toString();
    } catch (error) {
      return "en";
    }
  }

  static getDeviceID(): string {
    try {
      const Security = Module.load(
        "/System/Library/Frameworks/Security.framework/Security"
      );
      const SecItemCopyMatching = new NativeFunction(
        Module.getExportByName("Security", "SecItemCopyMatching"),
        "int",
        ["pointer", "pointer"]
      );
      const SecItemAdd = new NativeFunction(
        Module.getExportByName("Security", "SecItemAdd"),
        "int",
        ["pointer", "pointer"]
      );
      const SecItemDelete = new NativeFunction(
        Module.getExportByName("Security", "SecItemDelete"),
        "int",
        ["pointer"]
      );

      // iCloud Keychain
      const searchQuerySync = ObjC.classes.NSMutableDictionary.alloc().init();
      searchQuerySync.setObject_forKey_(
        ObjC.classes.NSNumber.numberWithBool_(true),
        "r_Data"
      );
      searchQuerySync.setObject_forKey_("genp", "class");
      searchQuerySync.setObject_forKey_("beatclone", "svce");
      searchQuerySync.setObject_forKey_("deviceID", "acct");
      searchQuerySync.setObject_forKey_(
        ObjC.classes.NSNumber.numberWithBool_(true),
        "sync"
      );

      const resultPtr = Memory.alloc(Process.pointerSize);
      Memory.writePointer(resultPtr, NULL);

      const searchStatusSync = SecItemCopyMatching(searchQuerySync, resultPtr);

      if (searchStatusSync === 0) {
        const resultRef = new ObjC.Object(Memory.readPointer(resultPtr));
        Logger.log("Using existing iCloud Device ID");
        return ObjC.classes.NSString.alloc()
          .initWithData_encoding_(resultRef, 4)
          .toString();
      }

      // Local Keychain
      const searchQueryLocal = ObjC.classes.NSMutableDictionary.alloc().init();
      searchQueryLocal.setObject_forKey_(
        ObjC.classes.NSNumber.numberWithBool_(true),
        "r_Data"
      );
      searchQueryLocal.setObject_forKey_("genp", "class");
      searchQueryLocal.setObject_forKey_("beatclone", "svce");
      searchQueryLocal.setObject_forKey_("deviceID", "acct");

      const localSearchStatus = SecItemCopyMatching(
        searchQueryLocal,
        resultPtr
      );

      if (localSearchStatus === 0) {
        const resultRef = new ObjC.Object(Memory.readPointer(resultPtr));
        const localId = ObjC.classes.NSString.alloc()
          .initWithData_encoding_(resultRef, 4)
          .toString();

        // Migrate to iCloud
        const saveQuery = ObjC.classes.NSMutableDictionary.alloc().init();
        saveQuery.setObject_forKey_("genp", "class");
        saveQuery.setObject_forKey_("beatclone", "svce");
        saveQuery.setObject_forKey_("deviceID", "acct");
        saveQuery.setObject_forKey_(resultRef, "v_Data");
        saveQuery.setObject_forKey_("ck", "pdmn");
        saveQuery.setObject_forKey_(
          ObjC.classes.NSNumber.numberWithBool_(true),
          "sync"
        );

        const saveStatus = SecItemAdd(saveQuery, NULL);

        if (saveStatus === 0) {
          SecItemDelete(searchQueryLocal);
          Logger.log("Migrated local Device ID to iCloud");
        }

        return localId;
      }

      // Create new ID
      Logger.log("Creating new Device ID");
      const uuid = ObjC.classes.NSUUID.UUID().UUIDString();
      const uuidData =
        ObjC.classes.NSString.stringWithString_(uuid).dataUsingEncoding_(4);

      const saveQuery = ObjC.classes.NSMutableDictionary.alloc().init();
      saveQuery.setObject_forKey_("genp", "class");
      saveQuery.setObject_forKey_("beatclone", "svce");
      saveQuery.setObject_forKey_("deviceID", "acct");
      saveQuery.setObject_forKey_(uuidData, "v_Data");
      saveQuery.setObject_forKey_("ck", "pdmn");
      saveQuery.setObject_forKey_(
        ObjC.classes.NSNumber.numberWithBool_(true),
        "sync"
      );

      SecItemAdd(saveQuery, NULL);
      return uuid;
    } catch (error) {
      Logger.log("[Keychain] Error getting Device ID");
      return "";
    }
  }
}

export default Device;

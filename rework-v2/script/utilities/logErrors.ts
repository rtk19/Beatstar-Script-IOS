import Logger from "../lib/Logger";
import {
  handleCustomSongMainMenuLog,
  installCustomSongLifecycleObserver,
} from "../customs/loadCustomSongs.js";

const forwardLog = (message: Il2Cpp.Object) => {
  const text = message.toString();
  Logger.log(text);
  handleCustomSongMainMenuLog(text);
};

export const logErrors = () => {
  installCustomSongLifecycleObserver();

  const logger = Il2Cpp.domain
    .assembly("SpaceApe.Logger")
    .image.class("Logger");

  logger.method("Warn").implementation = function (message: Il2Cpp.Object) {
    forwardLog(message);
  };
  logger.method("Info").implementation = function (message: Il2Cpp.Object) {
    forwardLog(message);
  };
  logger.method("Log").implementation = function (message: Il2Cpp.Object) {
    forwardLog(message);
  };
  logger.method("Debug").implementation = function (message: Il2Cpp.Object) {
    forwardLog(message);
  };
  logger.method("Error").implementation = function (message: Il2Cpp.Object) {
    forwardLog(message);
  };
};

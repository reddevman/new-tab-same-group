import { createBackgroundController } from "./background-controller.js";

const backgroundController = createBackgroundController({ chromeApi: chrome });

backgroundController.register();

import ocFullJS from "../lib/opencascade.full.js";
import ocFullWasm from "../lib/opencascade.full.wasm";
import { OpenCascadeInstance } from './occjs'

const initOpenCascade = ({
    mainJS = ocFullJS,
    mainWasm = ocFullWasm,
    worker = undefined,
    libs = [],
    module = {},
} = {}) => {
    return new Promise((resolve, reject) => {
        new mainJS({
            locateFile(path) {
                if (path.endsWith('.wasm')) {
                    return mainWasm;
                }
                if (path.endsWith('.worker.js') && !!worker) {
                    return worker;
                }
                return path;
            },
            ...module
        }).then(async oc => {
            for (let lib of libs) {
                await oc.loadDynamicLibrary(lib, { loadAsync: true, global: true, nodelete: true, allowUndefined: false });
            }

            const instance = new OpenCascadeInstance(oc);
            resolve(instance);
        });
    });
};

export default initOpenCascade;

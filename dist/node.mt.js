// patch __dirname
import { dirname } from 'path';
import { fileURLToPath } from 'url';
globalThis.__dirname = dirname(fileURLToPath(import.meta.url));
import { OpenCascadeInstance } from "./occjs.js";

// patch require
import { createRequire } from 'module';
globalThis.require = createRequire(import.meta.url);

const ocFullJS = globalThis.require("../lib/opencascade.full.multi-threaded.cjs");

const LIB_DIR = `${globalThis.__dirname}/../lib`;

const initOpenCascade = ({
    mainJS = ocFullJS,
    mainWasm = `${LIB_DIR}/opencascade.full.multi-threaded.wasm`,
    worker = `${LIB_DIR}/opencascade.full.multi-threaded.worker.cjs`,
    libs = [],
    module = {},
} = {}) => {
    return new Promise((resolve, reject) => {
        new mainJS({
            locateFile(path) {
                if (path.endsWith('.wasm')) {
                    return mainWasm;
                }
                if (path.endsWith('.worker.cjs')) {
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

import init  from "../lib/opencascade.full"
export * from "./occjs.d.ts";
import { OpenCascadeInstance } from "./occjs";

type OpenCascadeModuleObject = {
  [key: string]: any;
};

export default function initOpenCascade(
  settings?: {
    mainJS?: init;
    mainWasm?: string;
    worker?: string;
    libs?: string[];
    module?: OpenCascadeModuleObject;
  },
): Promise<OpenCascadeInstance>;

import { ClassDeclarationStructure, IntersectionTypeNode, MethodDeclarationStructure, ModuleKind, ModuleResolutionKind, OptionalKind, Project, PropertySignature, Scope, ScriptTarget, SourceFile, SyntaxKind, TypeAliasDeclaration, TypeLiteralNode } from "ts-morph";
import { rmSync } from "fs";

const OUT_DIR = "./dist";
const OVERLOAD_NAME_REGEX = /_\d+$/;

const targetProject = new Project({
    compilerOptions: {
        outDir: OUT_DIR,
        noEmitOnError: false,
        declaration: true,
        moduleResolution: ModuleResolutionKind.NodeNext,
        module: ModuleKind.NodeNext,
        target: ScriptTarget.ES2017,
        strict: false,
        esModuleInterop: true,
        skipLibCheck: true,
    },
});

type ClassInfo = {
    class: ClassDeclarationStructure,
    overloads: ClassDeclarationStructure[],
    derived: ClassDeclarationStructure[],
    overloadedMethods: OptionalKind<MethodDeclarationStructure>[],
    methods: OptionalKind<MethodDeclarationStructure>[],
}

const PrimitiveTypes = [
    "boolean",
    "number",
    "string"
];

const StandardTypes = [
    "Standard_Boolean",
    "Standard_Integer",
    "Standard_Real",
    "Standard_ShortReal",
    "Standard_Byte",
    "Standard_Size",
    "Standard_Character",
    "Standard_CString"
];

function main() {
    rmSync(`${OUT_DIR}/occjs.js`, { force: true });
    rmSync(`${OUT_DIR}/occjs.d.ts`, { force: true });

    const project = new Project();

    const sourceFile = project.addSourceFileAtPath("lib/opencascade.full.d.ts");

    const mainFile = targetProject.createSourceFile("occjs.ts", "", { overwrite: true });

    const typeAliases = sourceFile.getTypeAliases().map(typeAlias => ({ typeAlias, kind: typeAlias.getTypeNode().getKind() }));
    const enumTypeAliases = typeAliases.filter(typeAlias => typeAlias.kind === SyntaxKind.TypeLiteral);
    const enumNames = enumTypeAliases.map(typeAlias => typeAlias.typeAlias.getName());
    const primitiveTypeAliases = typeAliases.filter(typeAlias => typeAlias.kind === SyntaxKind.StringKeyword || typeAlias.kind === SyntaxKind.NumberKeyword || typeAlias.kind === SyntaxKind.BooleanKeyword);

    const isEnum = (type: string) => {
        return enumNames.includes(type) || type === 'Graphic3d_ZLayerId';
    };

    const isPrimitiveOrStandardOrEnum = (type: string) => {
        return PrimitiveTypes.includes(type) || StandardTypes.includes(type) || isEnum(type)
    }

    mainFile.addExportDeclaration({
        moduleSpecifier: "opencascade.js/dist/opencascade.full.js",
        isTypeOnly: true,
        namedExports: enumNames
    });

    const classResults = processClasses(sourceFile, isPrimitiveOrStandardOrEnum, isEnum);

    mainFile.addClasses(classResults);
    mainFile.addTypeAliases(primitiveTypeAliases.map(t => {
        const s = t.typeAlias.getStructure()
        s.isExported = true;
        return s;
    }));

    const typeAliasResults = processTypeAliases(typeAliases.map(t => t.typeAlias), classResults);

    mainFile.addClasses(typeAliasResults.classes);

    mainFile.addFunction({
        name: "_wrap_primitive_type",
        parameters: [{
            name: "value",
            type: "any",
        }],
        statements: `
                if (typeof (value) == "string") {
                    return new String(value);
                }
                else if (typeof (value) == "number") {
                    return new Number(value);
                }
                else if (typeof (value) == "boolean") {
                    return new Boolean(value);
                }

                return value;
                `
    });

    mainFile.addFunction({
        name: "__determine_ctor_overload",
        parameters: [{
            name: "className",
            type: "string",
        }, {
            name: "constructorsCount",
            type: "number",
        }],
        statements: `
        return function () {
                    if (arguments.length === 1 && Object.keys(arguments[0])[0] === "__from") {
                        this._overload = arguments[0].__from;
                        return;
                    }

                    const oc = this.getOC();
                    const args = Array.from(arguments);
                    for (let i = 0; i < constructorsCount; i++) {
                        const key = "__determine_ctor_overload_" + className + "_" + i;
                        const overloadType = this[key].apply(this, args);
                        if (overloadType) {
                            const typeInializer = oc[overloadType];
                            this._overload = new typeInializer(...args.map(arg => arg._overload || arg));
                            break;
                        }
                    }

                    if (!this._overload) {
                        throw new Error("No matching constructor overload found for class " + className);
                    }
        };
        `
    });

    mainFile.addFunction({
        name: "__determine_method_overload",
        parameters: [
            {
                name: "methodsCount",
                type: "number",
            }, {
                name: "methodName",
                type: "string",
            }, {
                name: "returnTypeName",
                type: "string",
            }, {
                name: "returnType",
                type: "any"
            }, {
                name: "isPrimitiveOrStandardOrEnum",
                type: "boolean"
            }],
        statements: `
        return function () {
                const args = Array.from(arguments);
                for (let i = 0; i < methodsCount; i++) {
                    const key = "__determine_method_overload_" + methodName + "_" + i;
                    const overloadType = this[key].apply(this, args);
                    if (overloadType) {
                        const __result = this._overload[overloadType].apply(this._overload, args.map(arg => arg._overload || arg));
                        if (returnTypeName && returnTypeName !== "void" && !isPrimitiveOrStandardOrEnum) {
                            return new returnType({ __from: __result });
                        }
                        else {
                            return __result;
                        }
                    }
                }
                throw new Error("No matching overload found for method " + methodName);
        }
        `
    });

    mainFile.addFunction({
        name: "__determine_method_overload_static",
        parameters: [{
            name: "oc",
            type: "any",
        },
        {
            name: "classType",
            type: "any",
        },
        {
            name: "className",
            type: "string",
        }, {
            name: "methodsCount",
            type: "number",
        }, {
            name: "methodName",
            type: "string",
        }, {
            name: "returnTypeName",
            type: "string",
        },
        {
            name: "returnType",
            type: "any"
        },
        {
            name: "isPrimitiveOrStandardOrEnum",
            type: "boolean"
        }],
        statements: `
        return function () {
                const args = Array.from(arguments);
                for (let i = 0; i < methodsCount; i++) {
                    const key = "__determine_method_overload_" + methodName + "_" + i;
                    const overloadType = classType[key].apply(this, args);
                    if (overloadType) {
                        const __result = oc[className][overloadType].apply(oc, args.map(arg => arg._overload || arg));
                        if (returnTypeName && returnTypeName !== "void" && !isPrimitiveOrStandardOrEnum) {
                            return new returnType({ __from: __result });
                        }
                        else {
                            return __result;
                        }
                    }
                }
                throw new Error("No matching overload found for method " + baseName);
        }
        `
    });

    console.log('Emitting...')
    setImmediate(async () => {
        targetProject.emit();
        console.log('Done!');
    });
}

function getPrimitiveFromStandardType(type: string) {
    switch (type) {
        case "Standard_Boolean":
            return "Boolean";
        case "Standard_Integer":
        case "Standard_Real":
        case "Standard_ShortReal":
        case "Standard_Byte":
        case "Standard_Size":
        case "Standard_Character":
            return "Number";
        case "Standard_CString":
            return "String";
        default:
            return type;
    }
}

function prepare(allClasses: ClassDeclarationStructure[], baseClasses: ClassDeclarationStructure[], classInfos: ClassInfo[]) {
    for (const classDeclaration of baseClasses) {
        const className = classDeclaration.name;
        if (classInfos.some(info => info.class.name === className)) {
            continue; // already processed
        }

        const derivedClasses = allClasses.filter(c => c.extends === className);
        const overloads = derivedClasses.filter(c => c.name.match(OVERLOAD_NAME_REGEX));
        const derived = derivedClasses.filter(c => overloads.indexOf(c) === -1);
        const allMethods = classDeclaration.methods || [];
        const methods = allMethods.filter(m => !m.name.match(OVERLOAD_NAME_REGEX));
        const overloadedMethods = allMethods.filter(m => methods.indexOf(m) === -1);

        classInfos.push({
            class: classDeclaration,
            overloads,
            derived,
            methods,
            overloadedMethods
        });

        prepare(allClasses, derived, classInfos);
    }
}

function processTypeAliases(typeAliases: TypeAliasDeclaration[], classResults: OptionalKind<ClassDeclarationStructure>[]) {
    const result: {
        classes: OptionalKind<ClassDeclarationStructure>[],
    } = {
        classes: [],
    };

    typeAliases.forEach(typeAlias => {
        const node = typeAlias.getTypeNode();
        const nodeKind = node.getKind();

        if (nodeKind === SyntaxKind.IntersectionType) {
            // this is the OpenCascadeInstance type
            // get the right part of the intersection
            const intersectionNode = node as IntersectionTypeNode;;
            const intersectionTypes = intersectionNode.getTypeNodes();
            const occType = intersectionTypes[intersectionTypes.length - 1] as TypeLiteralNode;

            const openCascadeInstanceClass: OptionalKind<ClassDeclarationStructure> = {
                name: "OpenCascadeInstance",
                isExported: true,
                properties: [],
                ctors: [{
                    parameters: [{
                        scope: Scope.Public,
                        name: "origin",
                        type: "any",
                    }],
                    statements: writer => {
                        writer.writeLine('this.origin = origin;');
                        writer.writeLine('const getOC = () => { return this.origin; }')
                        for (let cls of classResults) {
                            writer.writeLine(`${cls.name}.prototype['getOC'] = getOC;`);
                        }
                    }
                }]
            };

            result.classes.push(openCascadeInstanceClass);

            const isntanceProperties = occType.getProperties();

            const groupedByBaseName = new Map<string, PropertySignature[]>();
            for (let property of isntanceProperties) {
                const baseName = property.getName().replace(OVERLOAD_NAME_REGEX, "");
                if (!groupedByBaseName.has(baseName)) {
                    groupedByBaseName.set(baseName, []);
                }

                groupedByBaseName.get(baseName)?.push(property);
            }

            for (let [name, properties] of groupedByBaseName) {
                const kind = properties[0].getTypeNode()?.getKind() || SyntaxKind.Unknown;

                if (kind === SyntaxKind.TypeReference) {
                    // this is a reference to an enum
                    // set its value from the original occjs type
                    openCascadeInstanceClass.properties.push({
                        name: name,
                        type: `${name} = this.origin.${name}`,
                    });
                }
                else if (kind === SyntaxKind.TypeQuery) {
                    openCascadeInstanceClass.properties.push({
                        name: name,
                        type: `typeof ${name} = ${name}`,
                    });
                }
                else {
                    throw new Error(`Unsupported type for property ${name}: ${SyntaxKind[kind]}`);
                }
            }
        }
        else {
            // this is an enum type declaration. we skip it because we want to re-export the original enum from opencascade.js
        }
    });

    return result;
}


function processClasses(sourceFile: SourceFile, isPrimitiveOrStandardOrEnum: (type: string) => boolean, isEnum: (type: string) => boolean) {
    let allClasses = sourceFile.getClasses().map(c => c.getStructure());

    for (const cls of allClasses) {
        if (cls.name === cls.extends || (cls.extends && !allClasses.some(c => c.name === cls.extends))) {
            cls.extends = undefined; // remove the extends if the base class is not found
        }
    }

    const baseClasses = allClasses.filter(c => !c.extends);

    const classInfos: ClassInfo[] = [];
    console.log(`Getting class information from ${baseClasses.length} base classes...`);
    prepare(allClasses, baseClasses, classInfos);
    console.log(`Found ${classInfos.length} classes in the source file.`);

    const result: OptionalKind<ClassDeclarationStructure>[] = [];
    for (const clsInfo of classInfos) {
        const className = clsInfo.class.name
        let baseClass = clsInfo.class.extends as string | undefined;

        const newClass: OptionalKind<ClassDeclarationStructure> = {
            name: className,
            isExported: true,
            extends: baseClass,
            properties: [{
                name: "_overload",
                type: "any"
            }]
        };

        result.push(newClass);

        // handle constructor overloads
        if (clsInfo.overloads.length > 0) {
            const constructors = clsInfo.overloads.map(c => {
                const constructor = c.ctors[0]
                const params = constructor.parameters.map(p => {
                    const type = p.type;
                    return {
                        name: p.name,
                        type: type,
                        isOptional: p.hasQuestionToken
                    };
                });

                return {
                    name: c.name,
                    params: params,
                };
            });

            newClass.methods = newClass.methods || [];

            for (let i = 0; i < constructors.length; i++) {
                const ctor = constructors[i];
                newClass.methods.push({
                    name: `__determine_ctor_overload_${newClass.name}_${i}`,
                    scope: Scope.Private,
                    statements: writer => {
                        if (ctor.params.length === 0) {
                            writer.writeLine(`const match = arguments.length === 0;`);
                        }
                        else {
                            writer.writeLine('const __oc = this.getOC();');
                            writer.writeLine(`const match = (${ctor.params.length} === arguments.length) && (${ctor.params.map((p, paramIndex) => `_wrap_primitive_type(arguments[${paramIndex}]) instanceof(${isEnum(p.type as string) ? "__oc." : ""}${getPrimitiveFromStandardType(p.type as string)})`).join(" && ")})`);
                        }

                        writer.writeLine(`return match ? "${ctor.name}":0;`);
                    }
                });
            }

            newClass.ctors = newClass.ctors || [];
            newClass.ctors.push({
                statements: writer => {
                    writer.write(`
                    ${newClass.extends ? `super();` : ""}
                    __determine_ctor_overload("${newClass.name}", ${constructors.length}).apply(this, arguments);
                   `);
                },
                overloads: constructors.map(c => ({
                    parameters: c.params.map(p => ({
                        name: p.name,
                        type: p.type,
                        hasQuestionToken: p.isOptional,
                    })),
                })),
            });
        }
        else {
            newClass.ctors = newClass.ctors || [];
            newClass.ctors.push({
                overloads: clsInfo.class.ctors.map(c => ({
                    parameters: c.parameters.map(p => ({
                        name: p.name === "eval" ? "_eval" : p.name, // avoid using eval as a parameter name
                        type: p.type,
                        hasQuestionToken: p.hasQuestionToken,
                    })),
                })),
                statements: writer => {
                    if (newClass.extends) {
                        writer.writeLine(`super();`);
                    }
                    writer.write(`
                    if (arguments.length === 1 && Object.keys(arguments[0])[0] === "__from") {
                        this._overload = arguments[0].__from;
                        return;
                    }
                    else if (arguments.length === 0) {
                        // class may be abstract so an error may be thrown
                        try {
                            const oc = this.getOC();
                            this._overload = new oc.${newClass.name}();
                        }
                        catch (e) {
                        }
                    }
                   `);
                },
            });
        }

        newClass.methods = newClass.methods || [];
        // handle method overloads
        const overloadGroups = clsInfo.overloadedMethods.reduce((acc: { [key: string]: OptionalKind<MethodDeclarationStructure>[] }, method) => {
            const baseName = method.name.replace(OVERLOAD_NAME_REGEX, "");
            if (!acc[baseName]) {
                acc[baseName] = [];
            }

            acc[baseName].push(method);
            return acc;
        }, {});

        for (const [baseName, methods] of Object.entries(overloadGroups)) {
            for (let i = 0; i < methods.length; i++) {
                const method = methods[i];
                const params = method.parameters.map(p => {
                    const type = p.type;
                    return {
                        name: p.name,
                        type: type,
                        isOptional: p.hasQuestionToken
                    };
                });

                newClass.methods.push({
                    name: `__determine_method_overload_${baseName}_${i}`,
                    isStatic: method.isStatic,
                    statements: writer => {
                        writer.writeLine(`const __oc = ${newClass.name}.prototype.getOC();`);
                        if (params.length === 0) {
                            writer.writeLine(`const match = arguments.length === 0;`);
                        } else {
                            writer.writeLine(`const match = (${params.length} === arguments.length) || (${params.map(p => `_wrap_primitive_type(arguments[${i}]) instanceof(${isEnum(p.type as string) ? "__oc." : ""}${getPrimitiveFromStandardType(p.type as string)})`).join(" && ")})`);
                        }

                        writer.writeLine(`return match ? "${method.name}":0;`);
                    }
                });
            }
        }

        processMethods(clsInfo, newClass, isPrimitiveOrStandardOrEnum, isEnum);
    }

    return result;
}


function processMethods(classInfo: ClassInfo, targetClassDeclaration: OptionalKind<ClassDeclarationStructure>, isPrimitiveOrStandardOrEnum: (type: string) => boolean, isEnum: (type: string) => boolean) {
    // keep non overloaded methods without changes
    for (const method of classInfo.methods) {
        targetClassDeclaration.methods = targetClassDeclaration.methods || [];
        targetClassDeclaration.methods.push({
            ...method,
            parameters: method.parameters.map(p => {
                if (p.name === "eval") {
                    p.name = "_eval"; // avoid using eval as a parameter name
                }

                return p;
            }),
            statements: writer => {
                if (method.isStatic) {
                    writer.writeLine(`const __oc = ${classInfo.class.name}.prototype.getOC();`);
                    writer.writeLine(`const __result = __oc.${classInfo.class.name}.${method.name}.apply(__oc, Array.from(arguments).map(a => a._overload || a));`);
                    if (method.returnType && method.returnType !== "void") {
                        if (isPrimitiveOrStandardOrEnum(method.returnType as string)) {
                            writer.writeLine(`return __result;`);
                        }
                        else {
                            writer.writeLine(`return new ${method.returnType}({ __from: __result });`);
                        }
                    }
                }
                else {
                    writer.writeLine(`const __result = this._overload.${method.name}.apply(this._overload, Array.from(arguments).map(a => a._overload || a));`);
                    if (method.returnType && method.returnType !== "void") {
                        if (isPrimitiveOrStandardOrEnum(method.returnType as string)) {
                            writer.writeLine(`return __result;`);
                        }
                        else {
                            writer.writeLine(`return new ${method.returnType}({ __from: __result });`);
                        }
                    }
                }
            }
        });
    }

    // group overloaded methods by base name
    const overloadGroups = classInfo.overloadedMethods.reduce((acc: { [key: string]: OptionalKind<MethodDeclarationStructure>[] }, method) => {
        const baseName = method.name.replace(OVERLOAD_NAME_REGEX, "");
        if (!acc[baseName]) {
            acc[baseName] = [];
        }

        acc[baseName].push(method);
        return acc;
    }, {});

    for (const baseName in overloadGroups) {
        const methods = overloadGroups[baseName];
        targetClassDeclaration.methods = targetClassDeclaration.methods || [];
        const isStatic = methods[0].isStatic;
        targetClassDeclaration.methods.push({
            ...methods[0],
            name: baseName,
            overloads: methods.map(m => ({
                returnType: m.returnType as string || "void",
                parameters: m.parameters.map(p => {
                    const type = p.type;
                    return {
                        name: p.name === "eval" ? "_eval" : p.name, // avoid using eval as a parameter name
                        type: type,
                        hasQuestionToken: p.hasQuestionToken
                    };
                }),
            })),
            statements: writer => {
                const returnType = methods[0].returnType as string || "void"
                const hasReturnType = returnType && returnType !== "void";

                writer.writeLine(`const __oc = ${classInfo.class.name}.prototype.getOC();`);
                if (isStatic) {
                    writer.write(`return __determine_method_overload_static(__oc, ${classInfo.class.name}, "${classInfo.class.name}", ${methods.length}, "${baseName}", "${hasReturnType ? returnType : ""}", ${isEnum(returnType) ? "__oc." : ""}${hasReturnType ? getPrimitiveFromStandardType(returnType) : null}, ${isPrimitiveOrStandardOrEnum(returnType)}).apply(this, arguments);`);
                }
                else {
                    writer.write(`return __determine_method_overload(${methods.length}, "${baseName}", "${hasReturnType ? returnType : ""}", ${isEnum(returnType) ? "__oc." : ""}${hasReturnType ? getPrimitiveFromStandardType(returnType) : null}, ${isPrimitiveOrStandardOrEnum(returnType)}).apply(this, arguments);`);
                }
            }
        });
    }
}

main();


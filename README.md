# OCCJS-Wrapper (Opencascade.js Wrapper)

The purpose of this library is to provide a wrapper around the OCCJS library that helps with handling method overloads.

So instead of writing this:

```javascript
const point1 = new oc.gp_Pnt_3(0, 0, 0);
const point2 = new oc.gp_Pnt_2(new oc.gp_XYZ_1(0, 0, 0));
```

You can write this:

```javascript
const point1 = new oc.gp_Pnt(0, 0, 0);
const point2 = new oc.gp_Pnt(new oc.gp_XYZ(0, 0, 0));
```


The library will automatically resolve the correct overload based on the parameter types you pass.
When using with Typescript you get the overloads signatures information in the IDE.

Currently the library does not handle null parameters, so if any of the parameters is null, it will not be able to resolve the correct overload. This will be fixed in the future.

Please note I tested this only on a project I work on and it is working fine. I'll keep fixing bugs as I encounter them.

## Installation

```bash
npm install occjs-wrapper
```

## Usage

### Browser (single-threaded)

```javascript
import initOpenCascade from 'occjs-wrapper';

const oc = await initOpenCascade();
```

### Browser (multi-threaded)

Requires `SharedArrayBuffer`, which needs COOP/COEP headers on your server.

```javascript
import initOpenCascade from 'occjs-wrapper/multi-threaded';

const oc = await initOpenCascade();
```

### Node.js (single-threaded)

```javascript
import initOpenCascade from 'occjs-wrapper/node';

const oc = await initOpenCascade();
```

### Node.js (multi-threaded)

```javascript
import initOpenCascade from 'occjs-wrapper/node/multi-threaded';

const oc = await initOpenCascade();
```

## Importing types

```typescript
import initOpenCascade from 'occjs-wrapper';
import { gp_Pnt } from 'occjs-wrapper';
```

It would be cool to make this part of the original library, but it'll require some time and effort to integrate it which currently I do not have. If anyone is interested in contributing to the original library, please feel free to do so.

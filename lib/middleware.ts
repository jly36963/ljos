import {argsert} from './argsert.js';
import {maybeAsyncResult} from './utils/maybe-async-result.js';
import {isPromise} from './utils/is-promise.js';
import {
  Arguments,
  LjosInstance,
  Options,
  maybePromisePartialArgs,
  maybePromiseArgs,
} from './ljos-factory.js';

export class MiddlwareInstance {
  globalMiddleware: Middleware[] = [];
  ljos: LjosInstance;
  frozens: Array<Middleware[]> = [];
  constructor(ljos: LjosInstance) {
    this.ljos = ljos;
  }

  addMiddleware({
    f,
    applyBeforeValidation,
    global,
    mutates,
    applied,
    option = undefined,
  }: Middleware): LjosInstance {
    argsert(
      '<function> [boolean] [boolean] [boolean] [boolean] [string|undefined]',
      [f, applyBeforeValidation, global, mutates, applied, option]
    );
    const m: Middleware = {
      f,
      applyBeforeValidation,
      global,
      mutates,
      applied,
      option,
    };
    this.globalMiddleware.push(m);
    return this.ljos;
  }

  // For "coerce" middleware, only one middleware instance can be registered per option
  addCoerceMiddleware(f: middlewareFunc, option: string): LjosInstance {
    const aliases = this.ljos.getInternalMethods().getAliases();

    this.globalMiddleware = this.globalMiddleware.filter(m => {
      const toCheck = [...(aliases[option] || []), option];
      if (!m.option) return true;
      else return !toCheck.includes(m.option);
    });

    const middleware = coerceMwFactory(f, option);
    return this.addMiddleware(middleware);
  }

  getMiddleware() {
    return this.globalMiddleware;
  }

  freeze() {
    this.frozens.push([...this.globalMiddleware]);
  }

  unfreeze() {
    const frozen = this.frozens.pop();
    if (frozen !== undefined) this.globalMiddleware = frozen;
  }

  reset() {
    this.globalMiddleware = this.globalMiddleware.filter(m => m.global);
  }
}

/** Take middleware input and merge with defaults */
export function mwFactory(
  mw: middlewareInput,
  globalByDefault: boolean,
  mutates: boolean
): Middleware {
  const {f, global, applyBeforeValidation} = mwFuncToObj(mw);
  return {
    f,
    global: global ?? globalByDefault,
    applyBeforeValidation: applyBeforeValidation ?? false,
    mutates,
    applied: false,
  };
}

/** Convert mw func/obj union is obj */
export function mwFuncToObj(mw: middlewareInput): MiddlewareObj {
  return typeof mw === 'function' ? {f: mw} : mw;
}

export function commandMwFactory(mw: middlewareInput) {
  return mwFactory(mw, false, true);
}

export function globalMwFactory(mw: middlewareInput) {
  return mwFactory(mw, true, true);
}

export function checkMwFactory(mw: middlewareInput) {
  return mwFactory(mw, true, false);
}

function coerceMwFactory(f: middlewareFunc, option: string) {
  return {
    f,
    applyBeforeValidation: true,
    global: true,
    mutates: true,
    applied: false,
    option,
  };
}

// TODO: make DRY
/** Convert mw func/obj union is obj */
export function checkMwFuncToObj(mw: checkInput): CheckObj {
  return typeof mw === 'function' ? {f: mw} : mw;
}

/** Convert a user-provided check input to a middleware */
export function convertCheckToMiddleware(
  checkMw: checkInput,
  globalDefault = true
) {
  // Convert checkMw to obj, then destructure
  const {f: checkCallback, global = globalDefault} = checkMwFuncToObj(checkMw);

  // Convert check cb to middleware cb
  const middlewareCallback = (
    argv: Arguments,
    ljos: LjosInstance
  ): maybePromisePartialArgs =>
    maybeAsyncResult<maybePromisePartialArgs | any>(
      // Get result of check callback
      () => checkCallback(argv, ljos.getInternalMethods().getOptions()),
      // Handle result of check callback
      () => {},
      // Handle error of check callback
      (err: Error) => {
        ljos
          .getInternalMethods()
          .getUsageInstance()
          .fail(err.message ? err.message : err.toString(), err);
      }
    );

  // Convert cb to middleware
  const middleware = checkMwFactory({f: middlewareCallback, global});
  return middleware;
}

/** Apply middleware (if appropriate) and merge result with argv */
export function applyMiddleware(
  argv: Arguments | Promise<Arguments>,
  ljos: LjosInstance,
  middlewares: Middleware[],
  beforeValidation: boolean
): maybePromiseArgs {
  return middlewares.reduce<maybePromiseArgs>((acc, middleware) => {
    // Apply middleware at correct step (before or after validation)`
    if (middleware.applyBeforeValidation !== beforeValidation) {
      return acc;
    }

    // Only apply mutating middleware once (coerce)
    if (middleware.mutates) {
      if (middleware.applied) return acc;
      middleware.applied = true;
    }

    if (isPromise(acc)) {
      return acc
        .then(initialObj =>
          Promise.all([initialObj, middleware.f(initialObj, ljos)])
        )
        .then(([initialObj, middlewareObj]) =>
          Object.assign(initialObj, middlewareObj)
        );
    }

    const result = middleware.f(acc, ljos);
    return isPromise(result)
      ? result.then(middlewareObj => Object.assign(acc, middlewareObj))
      : Object.assign(acc, result);
  }, argv);
}

// export interface MiddlewareCallback {
//   (argv: Arguments, ljos: LjosInstance): maybePromisePartialArgs;
// }

export type middlewareFunc = (
  argv: Arguments,
  ljos: LjosInstance
) => maybePromisePartialArgs;

export interface MiddlewareObj {
  f: middlewareFunc;
  applyBeforeValidation?: boolean;
  global?: boolean;
}

export type middlewareInput = middlewareFunc | MiddlewareObj;

export type checkFunc = (argv: Arguments, options: Options) => void;

export interface CheckObj {
  f: checkFunc;
  global?: boolean;
}

export type checkInput = checkFunc | CheckObj;

export interface Middleware extends MiddlewareObj {
  mutates: boolean;
  applied: boolean;
  option?: string; // Only one coerce middleware can be registered per option
}

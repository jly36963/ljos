import {argsert} from './argsert.js';
import {isPromise} from './utils/is-promise.js';
import {
  Arguments,
  LjosInstance,
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
  mw: middlewareFunc | MiddlewareInput,
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

export function mwFuncToObj(
  mw: middlewareFunc | MiddlewareInput
): MiddlewareInput {
  return typeof mw === 'function' ? {f: mw} : mw;
}

export function commandMwFactory(mw: middlewareFunc | MiddlewareInput) {
  return mwFactory(mw, false, true);
}

export function globalMwFactory(mw: middlewareFunc | MiddlewareInput) {
  return mwFactory(mw, true, true);
}

export function checkMwFactory(mw: middlewareFunc | MiddlewareInput) {
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

export interface MiddlewareInput {
  f: middlewareFunc;
  applyBeforeValidation?: boolean;
  global?: boolean;
}

export interface Middleware extends MiddlewareInput {
  mutates: boolean;
  applied: boolean;
  option?: string; // Only one coerce middleware can be registered per option
}

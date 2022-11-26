import {Nil} from '../typings/common-types';

/** Convert a string from kebab to camel case */
export function camelCase(str: string): string {
  // Handle the case where an argument is provided as camel case, e.g., fooBar.
  // by ensuring that the string isn't already mixed case:
  const isCamelCase = str !== str.toLowerCase() && str !== str.toUpperCase();

  if (!isCamelCase) {
    str = str.toLowerCase();
  }

  if (str.indexOf('-') === -1 && str.indexOf('_') === -1) {
    return str;
  } else {
    let camelcase = '';
    let nextChrUpper = false;
    const leadingHyphens = str.match(/^-+/);
    for (
      let i = leadingHyphens ? leadingHyphens[0].length : 0;
      i < str.length;
      i++
    ) {
      let chr = str.charAt(i);
      if (nextChrUpper) {
        nextChrUpper = false;
        chr = chr.toUpperCase();
      }
      if (i !== 0 && (chr === '-' || chr === '_')) {
        nextChrUpper = true;
      } else if (chr !== '-' && chr !== '_') {
        camelcase += chr;
      }
    }
    return camelcase;
  }
}

/** Convert a string from camel to kebab case */
export function decamelize(str: string, joinString?: string): string {
  const lowercase = str.toLowerCase();
  joinString = joinString || '-';
  let notCamelcase = '';
  for (let i = 0; i < str.length; i++) {
    const chrLower = lowercase.charAt(i);
    const chrString = str.charAt(i);
    if (chrLower !== chrString && i > 0) {
      notCamelcase += `${joinString}${lowercase.charAt(i)}`;
    } else {
      notCamelcase += chrString;
    }
  }
  return notCamelcase;
}

/** Determine if input is a number or looks like one */
export function looksLikeNumber(x: Nil | number | string): boolean {
  if (x === null || x === undefined) return false;
  // if loaded from config, may already be a number.
  if (typeof x === 'number') return true;
  // hexadecimal.
  if (/^0x[0-9a-f]+$/i.test(x)) return true;
  // don't treat 0123 as a number; as it drops the leading '0'.
  if (/^0[^.]/.test(x)) return false;
  return /^[-]?(?:\d+(?:\.\d*)?|\.\d+)(e[-+]?\d+)?$/.test(x);
}

import esmPlatformShim from './lib/platform-shims/esm.mjs';
import {LjosFactory} from './build/lib/ljos-factory.js';

const Ljos = LjosFactory(esmPlatformShim);
export default Ljos;

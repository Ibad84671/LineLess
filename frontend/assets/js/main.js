// Application bootstrap.

import { startRouter } from './router.js';
import { toast } from './dom.js';

if (!window.LINELESS_CONFIG) {
  toast('Runtime configuration missing. Was the frontend built with scripts/build.js?', 'error', 10000);
}

startRouter();

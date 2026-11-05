export default {
 props:{skeleton:Boolean},
 template:`<div class="loading-notice" role="status">
  <span class="loading-notice-text"><span class="loading-dot" aria-hidden="true"></span><slot /></span>
  <span v-if="skeleton" class="loading-skeleton" aria-hidden="true"><i></i><i></i><i></i></span>
 </div>`
};

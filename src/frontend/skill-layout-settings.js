import {computed,ref} from 'vue';
import {layoutControls,normalizeLayoutPreferences,readLayoutPreferences,saveLayoutPreferences} from './skill-layout-preferences.js';

export default {
 setup() {
  const saved = ref(readLayoutPreferences());
  const values = ref({...saved.value});
  const message = ref('');
  const error = ref(false);
  const dirty = computed(() => layoutControls.some(({key}) => values.value[key] !== saved.value[key]));

  function save() {
   try {
    saveLayoutPreferences(values.value);
    saved.value = normalizeLayoutPreferences(values.value);
    error.value = false;
    message.value = '布局偏好已保存。打开详细分析查看效果。';
   } catch {
    error.value = true;
    message.value = '浏览器无法保存布局偏好。';
   }
  }

  function reset() {
   values.value = normalizeLayoutPreferences();
   message.value = '';
  }

  return {layoutControls, values, dirty, message, error, save, reset};
 },
 template:`<article class="panel" aria-label="技能图谱布局偏好">
  <div class="panel-head module-head"><h2>技能图谱布局偏好</h2><div>
   <button @click="reset">恢复默认值</button>
   <button class="module-save" :class="{dirty}" :disabled="!dirty" @click="save">保存布局偏好</button>
  </div></div>
  <p class="footnote">偏好保存在当前浏览器，打开详细分析时应用。</p>
  <div v-for="control in layoutControls" :key="control.key" class="skill-layout-control">
   <label>
    <span>{{control.label}} <output>{{values[control.key]}}%</output></span>
    <input type="range" v-model.number="values[control.key]" :min="control.min" :max="control.max" :step="control.step" :aria-label="control.label">
   </label>
   <p class="footnote">{{control.hint}}</p>
  </div>
  <p v-if="message" :role="error?'alert':'status'" :class="{error}">{{message}}</p>
 </article>`
};

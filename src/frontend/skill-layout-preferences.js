export const layoutControls = [
 {key:'friction', label:'摩擦', min:12, max:48, step:1, initial:24, hint:'越高，节点移动衰减越快。'},
 {key:'repulsion', label:'节点斥力', min:50, max:200, step:5, initial:100, hint:'越高，节点越倾向于分散。'},
 {key:'treeSpacing', label:'主树间距', min:50, max:200, step:5, initial:100, hint:'越高，不同主树的节点越倾向于拉开距离。'},
 {key:'spring', label:'连线拉力', min:50, max:175, step:5, initial:100, hint:'越高，相连节点越倾向于靠近连线的目标长度。'}
];

const storageKey = 'acmer-skill-layout';

export function normalizeLayoutPreferences(values) {
 return Object.fromEntries(layoutControls.map(({key,min,max,initial}) => {
  const value = values?.[key];
  return [key, Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : initial];
 }));
}

export function readLayoutPreferences() {
 try {
  return normalizeLayoutPreferences(JSON.parse(localStorage.getItem(storageKey)));
 } catch {
  return normalizeLayoutPreferences();
 }
}

export function saveLayoutPreferences(values) {
 localStorage.setItem(storageKey, JSON.stringify(normalizeLayoutPreferences(values)));
}

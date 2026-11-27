import { ref } from "vue";

export const renderTick = ref(0);

export function refreshVue(): void {
  renderTick.value += 1;
}

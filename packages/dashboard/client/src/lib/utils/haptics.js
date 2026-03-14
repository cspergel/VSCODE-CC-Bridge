/** Haptic feedback patterns */
export function haptic(type = 'light') {
  if (!navigator.vibrate) return;
  switch (type) {
    case 'light':  navigator.vibrate(10); break;
    case 'medium': navigator.vibrate(20); break;
    case 'heavy':  navigator.vibrate(40); break;
    case 'double': navigator.vibrate([15, 50, 15]); break;
    case 'success': navigator.vibrate([10, 30, 10, 30, 10]); break;
    case 'error':  navigator.vibrate([50, 30, 50]); break;
  }
}

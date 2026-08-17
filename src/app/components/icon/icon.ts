import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'svg[appIcon]',
  template: `<svg:use [attr.href]="href()" />`,
})
export class Icon {
  readonly appIcon = input.required<string>();
  protected readonly href = computed(() => `/svg/icons.svg#${this.appIcon()}`);
}

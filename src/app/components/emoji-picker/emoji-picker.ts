import { Component, output } from '@angular/core';
import { EMOJI_CATEGORIES } from '../../shared/emoji-list';

// Small reusable popover — the composer's "insert emoji" button and message
// reactions both need "pick one emoji from a short list", just with a
// different anchor/placement per call site.
@Component({
  selector: 'app-emoji-picker',
  imports: [],
  templateUrl: './emoji-picker.html',
  styleUrl: './emoji-picker.css',
})
export class EmojiPicker {
  protected readonly categories = EMOJI_CATEGORIES;

  readonly pick = output<string>();

  select(emoji: string): void {
    this.pick.emit(emoji);
  }
}

import {Component, inject, OnInit} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {MsalService} from '@azure/msal-angular';
import { UpdateBanner } from './components/update-banner/update-banner';
import { ModerationNotice } from './components/moderation-notice/moderation-notice';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, UpdateBanner, ModerationNotice],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App  {


}

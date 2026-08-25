import {Component, inject, OnInit} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {MsalService} from '@azure/msal-angular';
import { UpdateBanner } from './components/update-banner/update-banner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, UpdateBanner],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App  {


}

import {Component, inject, OnInit} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {MsalService} from '@azure/msal-angular';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private msalService = inject(MsalService);

  ngOnInit(): void {
    // Обязательно для MSAL: обрабатывает ответ от Entra ID после редиректа
    this.msalService.handleRedirectObservable().subscribe();
  }
}

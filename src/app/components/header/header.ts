import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon/icon';
import { MockDataService } from '../../services/mock-data.service';

@Component({
  selector: 'app-header',
  imports: [RouterLink, Icon],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private readonly data = inject(MockDataService);
  protected readonly currentUser = this.data.currentUser;
}

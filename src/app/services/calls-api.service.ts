import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiEndpoints } from '../core/http/api-endpoints';
import { ActiveCallDto, GroupCallProvidersDto } from '../interfaces/active-call';

@Injectable({ providedIn: 'root' })
export class CallsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  getActiveCalls(): Observable<ActiveCallDto[]> {
    return this.http.get<ActiveCallDto[]>(`${this.base}${ApiEndpoints.calls.active}`);
  }

  getProviders(): Observable<GroupCallProvidersDto> {
    return this.http.get<GroupCallProvidersDto>(`${this.base}${ApiEndpoints.calls.providers}`);
  }
}

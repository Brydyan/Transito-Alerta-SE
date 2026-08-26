import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ConnectionService {
  private isOnline$ = new BehaviorSubject<boolean>(navigator.onLine);

  constructor() {
    window.addEventListener('online', () => this.isOnline$.next(true));
    window.addEventListener('offline', () => this.isOnline$.next(false));
  }

  getConnectionStatus$(): Observable<boolean> {
    return this.isOnline$.asObservable();
  }

  isOnline(): boolean {
    return this.isOnline$.value;
  }
}

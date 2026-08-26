import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root',
})
export class GeolocationService {
  private currentLocation$ = new BehaviorSubject<Coordinates | null>(null);

  getCurrentLocation(): Observable<Coordinates> {
    return new Observable(observer => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const coords: Coordinates = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: new Date(position.timestamp),
            };
            this.currentLocation$.next(coords);
            observer.next(coords);
            observer.complete();
          },
          (error) => {
            observer.error(`Geolocation error: ${error.message}`);
          },
        );
      } else {
        observer.error('Geolocation not supported');
      }
    });
  }

  watchLocation(): Observable<Coordinates> {
    return new Observable(observer => {
      if (navigator.geolocation) {
        const watchId = navigator.geolocation.watchPosition(
          (position) => {
            const coords: Coordinates = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: new Date(position.timestamp),
            };
            this.currentLocation$.next(coords);
            observer.next(coords);
          },
          (error) => {
            observer.error(`Geolocation error: ${error.message}`);
          },
        );

        return () => {
          navigator.geolocation.clearWatch(watchId);
        };
      } else {
        observer.error('Geolocation not supported');
        return () => {};
      }
    });
  }

  getCurrentLocation$(): Observable<Coordinates | null> {
    return this.currentLocation$.asObservable();
  }
}

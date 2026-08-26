import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from './http.service';
import { Comment, CreateCommentDto } from '../models/comment.model';

@Injectable({
  providedIn: 'root',
})
export class CommentService {
  constructor(private httpService: HttpService) {}

  getComments(incidentId: string): Observable<Comment[]> {
    return this.httpService.get<Comment[]>(`/incidents/${incidentId}/comments`);
  }

  createComment(incidentId: string, dto: CreateCommentDto): Observable<Comment> {
    return this.httpService.post<Comment>(`/incidents/${incidentId}/comments`, dto);
  }

  deleteComment(id: string): Observable<void> {
    return this.httpService.delete<void>(`/comments/${id}`);
  }
}

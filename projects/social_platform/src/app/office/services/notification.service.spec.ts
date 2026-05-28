/** @format */

import { TestBed } from "@angular/core/testing";
import { of } from "rxjs";
import { ApiService } from "projects/core";

import { NotificationService } from "./notification.service";

describe("NotificationService", () => {
  let service: NotificationService;
  let apiService: jasmine.SpyObj<ApiService>;

  beforeEach(() => {
    apiService = jasmine.createSpyObj<ApiService>("ApiService", ["get", "post"]);

    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useValue: apiService }],
    });
    service = TestBed.inject(NotificationService);
  });

  it("should load unread count from backend", done => {
    apiService.get.and.returnValue(of({ count: 6 }));

    service.loadUnreadCount();

    service.unreadCount$.subscribe(count => {
      if (count === 6) {
        expect(apiService.get).toHaveBeenCalledWith("/notifications/unread-count/");
        done();
      }
    });
  });

  it("should mark all local notifications read", done => {
    apiService.get.and.returnValue(
      of({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 1,
            type: "program_moderation_approved",
            title: "Title",
            message: "Message",
            objectType: "program",
            objectId: 1,
            url: "/office/program/1",
            isRead: false,
            createdAt: new Date().toISOString(),
            category: "moderation",
          },
        ],
      })
    );
    apiService.post.and.returnValue(of({ updated: 1 }));

    service.loadLatest();
    service.markAllRead().subscribe(() => {
      service.notifications$.subscribe(notifications => {
        if (notifications.length) {
          expect(notifications[0].isRead).toBeTrue();
          expect(apiService.post).toHaveBeenCalledWith("/notifications/mark-all-read/", {});
          done();
        }
      });
    });
  });
});

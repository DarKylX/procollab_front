import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of } from "rxjs";
import { Router } from "@angular/router";

import { NotificationsComponent } from "./notifications.component";
import { NotificationService } from "@services/notification.service";

describe("NotificationsComponent", () => {
  let component: NotificationsComponent;
  let fixture: ComponentFixture<NotificationsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        {
          provide: NotificationService,
          useValue: {
            getNotifications: () => of({ count: 0, next: null, previous: null, results: [] }),
            refreshSummary: () => undefined,
            markAllRead: () => of({ updated: 0 }),
            markRead: () => of({}),
          },
        },
        {
          provide: Router,
          useValue: { navigateByUrl: () => Promise.resolve(true) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});

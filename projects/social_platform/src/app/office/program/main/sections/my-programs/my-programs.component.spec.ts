/** @format */

import { MyProgramsComponent } from "./my-programs.component";
import { Program } from "@office/program/models/program.model";

describe("MyProgramsComponent", () => {
  it("should split programs into visible sections", () => {
    const component = new MyProgramsComponent();
    component.programs = [
      { id: 1, status: "draft", isUserManager: true } as Program,
      { id: 2, status: "published", isUserManager: true } as Program,
      { id: 3, status: "published", isUserExpert: true } as Program,
      { id: 4, status: "published", isUserMember: true } as Program,
      { id: 5, status: "archived", isUserManager: true } as Program,
    ];

    expect(component.activeSections.map(section => section.title)).toEqual([
      "Черновики и на модерации",
      "Опубликованные",
      "Где я эксперт",
      "Где я участвую",
    ]);
    expect(component.archivePrograms.length).toBe(1);
  });

  it("should report empty state when there are no sections", () => {
    const component = new MyProgramsComponent();

    expect(component.isEmpty).toBeTrue();
  });
});

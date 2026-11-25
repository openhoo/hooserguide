@manual
Feature: Mit HooTasks arbeiten
  HooTasks hält die Arbeit Ihres Teams übersichtlich. Legen Sie Aufgaben an,
  prüfen Sie das gespeicherte Ergebnis und passen Sie Ihre Einstellungen an.

  Background:
    Given I open "/"
    Then "role=heading:Your workspace, in focus." is visible

  @tasks
  Scenario: Die erste Aufgabe anlegen
    Legen Sie eine Aufgabe an. Prüfen Sie nach dem Neuladen, ob Titel und Priorität weiterhin in der Liste stehen.

    And I add a prerequisite "Öffnen Sie Ihren Arbeitsbereich mit der Berechtigung, Aufgaben anzulegen."
    And I add a tip "Verwenden Sie einen kurzen Titel, der den nächsten Arbeitsschritt beschreibt."
    And I explain "Geben Sie einen eindeutigen Aufgabentitel ein und wählen Sie die Priorität."
    And I capture "Aufgabendetails ausfüllen"
      """json
      {
        "focus": "css=.grid > .card:first-child",
        "padding": 18,
        "description": "A bezeichnet den Titel, B die Priorität. Wählen Sie Create task zum Speichern.",
        "marks": [
          { "target": "label=Task title", "kind": "box", "label": "A", "caption": "Geben Sie der Aufgabe einen aussagekräftigen Titel." },
          { "target": "label=Priority", "kind": "both", "label": "B", "caption": "Wählen Sie eine passende Priorität für Ihr Team." },
          { "target": "role=button:Create task", "kind": "arrow", "label": "1", "caption": "Speichern Sie die neue Aufgabe." }
        ]
      }
      """
    When I fill "label=Task title" with "Prepare the launch checklist"
    And I select "high" in "label=Priority"
    And I click "role=button:Create task"
    Then "role=status:Task result" has text "Task created successfully."
    And "testid=task-list" has text "Prepare the launch checklistHigh priority"
    And I explain "Wählen Sie Create task. Prüfen Sie, ob die Aufgabe in der Liste und eine Bestätigung erscheinen."
    And I capture "Gespeicherte Aufgabe prüfen"
      """json
      {
        "description": "Die Aufgabe erscheint im Arbeitsbereich. Die Bestätigung zeigt den erfolgreichen Speichervorgang.",
        "marks": [
          { "target": "testid=task-list", "kind": "box", "label": "2", "caption": "Die neu angelegte Aufgabe." },
          { "target": "role=status:Task result", "kind": "both", "label": "3", "caption": "Bestätigung des erfolgreichen Speicherns." }
        ]
      }
      """

    And I capture "Aufgabenformular im Detail"
      """json
      {
        "focus": "css=.grid > .card:first-child",
        "padding": 18,
        "autoLabels": "letters",
        "description": "Nach dem Speichern mit Create task erscheint unter der Schaltfläche die Bestätigung (C).",
        "marks": [
          { "target": "label=Task title", "kind": "box", "caption": "Der Aufgabentitel." },
          { "target": "label=Priority", "kind": "both", "color": "#2563eb", "caption": "Die gewählte Priorität." },
          { "target": "role=status:Task result", "kind": "arrow", "caption": "Die Speicherbestätigung." }
        ]
      }
      """

    When I reload the page
    Then "testid=task-list" has text "Prepare the launch checklistHigh priority"
    And I explain "Laden Sie die Seite neu. Prüfen Sie unter Upcoming tasks, ob Titel und Priorität Ihrer Aufgabe unverändert sind."

  @preferences
  Scenario: Benachrichtigungen anpassen
    Legen Sie für diese Browsersitzung fest, ob Sie E-Mail-Benachrichtigungen erhalten möchten.

    And I add a note "Einstellungen werden getrennt von den einzelnen Aufgaben gespeichert."
    And I add a warning "Aktivieren Sie E-Mail-Benachrichtigungen nur für ein Konto, das Sie kontrollieren."
    When I scroll to "label=Email notifications"
    And I check "label=Email notifications"
    Then "label=Email notifications" is checked
    And I click "role=button:Save preferences"
    Then "role=status:Preferences result" has text "Preferences saved."
    And I explain "Scrollen Sie unter die Aufgabenliste zu Workspace preferences. Aktivieren Sie Email notifications und wählen Sie Save preferences."
    And I explain "Unter der Schaltfläche erscheint die Meldung „Preferences saved.“"
    And I capture "Einstellungen des Arbeitsbereichs"
      """json
      {
        "focus": "css=.preferences",
        "padding": 24,
        "description": "Wählen Sie unter Workspace preferences die Option Email notifications (A) und dann Save preferences (B).",
        "marks": [
          { "target": "label=Email notifications", "kind": "box", "label": "A", "caption": "Schalten Sie Benachrichtigungen ein oder aus." },
          { "target": "role=button:Save preferences", "kind": "box", "label": "B", "caption": "Speichern Sie Ihre Einstellungen." }
        ]
      }
      """
    When I reload the page
    Then "label=Email notifications" is checked

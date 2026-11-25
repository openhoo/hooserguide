@manual
Feature: Work in your HooTasks workspace
  Create a task and choose your notification preference on a desktop, tablet or phone.

  Background:
    Given I open "/"
    Then "role=heading:Your workspace, in focus." is visible

  @tasks
  Scenario: Create a high-priority task
    Add a task to Upcoming tasks and check that its title and priority remain after you reload the page.

    When I fill "label=Task title" with "Review the launch checklist"
    And I select "high" in "label=Priority"
    Then "label=Task title" has value "Review the launch checklist"
    And "label=Priority" has value "high"
    And I explain "Under Create a task, enter a Task title and choose High priority. Select Create task."
    And I capture "Title and priority before saving"
      """json
      {
        "focus": "css=#task-form",
        "padding": 10,
        "description": "The form is ready to submit with the example title and High priority selected.",
        "marks": [
          { "target": "role=button:Create task", "kind": "box", "label": "A", "caption": "Add this task to Upcoming tasks." }
        ]
      }
      """
    When I click "role=button:Create task"
    Then "role=status:Task result" has text "Task created successfully."
    When I reload the page
    And I scroll to "testid=task-list"
    Then "testid=task-list" has text "Review the launch checklistHigh priority"
    And I explain "When you see “Task created successfully.”, reload the page. Find your title under Upcoming tasks and check that High priority appears below it."
    And I capture "The saved task after a reload"
      """json
      {
        "focus": "testid=task-list",
        "padding": 12,
        "description": "The saved entry shows the task title with High priority on the next line.",
        "marks": [
          { "target": "css=.priority", "kind": "box" }
        ]
      }
      """

  @preferences
  Scenario: Save your notification preference
    Turn on Email notifications for this browser session and check your saved choice.

    When I scroll to "label=Email notifications"
    And I check "label=Email notifications"
    Then "label=Email notifications" is checked
    When I click "role=button:Save preferences"
    Then "role=status:Preferences result" has text "Preferences saved."
    And I explain "Scroll down to Workspace preferences. Select Email notifications, then Save preferences. Look below the button for “Preferences saved.”"
    And I capture "The saved notification setting"
      """json
      {
        "focus": "css=.preferences",
        "padding": 18,
        "description": "The checkmark shows the selected setting; the message below the button confirms the save.",
        "marks": [
          { "target": "label=Email notifications", "kind": "box", "label": "A", "caption": "A checkmark means notifications are on." },
          { "target": "role=button:Save preferences", "kind": "box", "label": "B", "caption": "Save your choice for this session." }
        ]
      }
      """
    When I reload the page
    And I scroll to "label=Email notifications"
    Then "label=Email notifications" is checked
    And I explain "Reload the page and return to Workspace preferences. Email notifications should still be checked."

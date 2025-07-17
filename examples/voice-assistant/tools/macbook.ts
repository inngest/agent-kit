/// <reference types="@jxa/global-type" />

import { createTool } from '@inngest/agent-kit';
import { execSync } from "child_process";
import { z } from "zod";
import type { VoiceAssistantNetworkState } from "..";
import { run } from '@jxa/run';
import { runAppleScript } from 'run-applescript';

const parameters = z.object({});

// Type definitions for our return values
interface CalendarEvent {
  title: string;
  startDate: string;
  endDate: string;
  location: string | null;
  calendar: string;
  isAllDay: boolean;
  notes?: string | null;
}

interface Reminder {
  title: string;
  completed: boolean;
  dueDate: string | null;
  notes: string | null;
  list: string;
}

interface Note {
  title: string;
  content: string;
  folder: string;
  createdDate: string;
  modifiedDate: string;
}

interface Email {
  subject: string;
  sender: string;
  dateSent: string;
  preview: string;
  mailbox: string;
  account: string;
}

interface Contact {
  name: string;
  phones: Array<{ label: string; value: string }>;
  emails: Array<{ label: string; value: string }>;
  organization?: string;
}

// Phone number normalization function adapted from reference
function normalizePhoneNumber(phone: string): string {
    // Remove all non-numeric characters except +
    const cleaned = phone.replace(/[^0-9+]/g, '');
    
    // If it's already in the correct E.164 format, return it
    if (/^\+1\d{10}$/.test(cleaned)) {
        return cleaned;
    }
    
    // If it starts with 1 and has 11 digits total
    if (/^1\d{10}$/.test(cleaned)) {
        return `+${cleaned}`;
    }
    
    // If it's 10 digits
    if (/^\d{10}$/.test(cleaned)) {
        return `+1${cleaned}`;
    }
    
    // Fallback for other formats
    if (cleaned.startsWith('+')) {
        return cleaned;
    }
    return `+1${cleaned}`;
}

export const macTranscribeAudio = createTool<
  typeof parameters,
  VoiceAssistantNetworkState
>({
  name: "transcribe_audio",
  description:
    "Immediately starts transcribing audio from the microphone",
  parameters,
  handler: async (_, { step }) => {
    try {
      await step?.run("transcribe-audio", async () => {
        console.log("Pressing option + space to open Superwhisper");
        execSync(
          `osascript -e 'tell application "System Events" to keystroke " " using {option down}'`
        );
      });
      return { status: "Successfully pressed option + space to begin transcribing audio" };
    } catch (error) {
      console.error("Failed to press keys and transcribe audio:", error);
      if (error instanceof Error) {
        throw new Error(
          `Failed to simulate key press and transcribe audio: ${error.message}`
        );
      }
      throw new Error(
        "Failed to simulate key press and transcribe audio due to an unknown error."
      );
    }
  },
});

// Calendar Tools
export const getTodaysEvents = createTool<
  z.ZodObject<{}>,
  VoiceAssistantNetworkState
>({
  name: "get_todays_events",
  description: "Fetches all calendar events for today",
  parameters: z.object({}),
  handler: async (_, { step }) => {
    const events = await step?.run("get-todays-events", async () => {
      return run<CalendarEvent[]>(() => {
        const Calendar = Application("Calendar");
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const allEvents: CalendarEvent[] = [];
        const calendars = Calendar.calendars();
        
        for (const calendar of calendars) {
          const calendarName = calendar.name();
          const events = calendar.events.whose({
            _and: [
              { startDate: { _greaterThan: today }},
              { startDate: { _lessThan: tomorrow }}
            ]
          })();
          
          for (const event of events) {
            allEvents.push({
              title: event.summary(),
              startDate: event.startDate().toISOString(),
              endDate: event.endDate().toISOString(),
              location: event.location() || null,
              calendar: calendarName,
              isAllDay: event.alldayEvent()
            });
          }
        }
        
        return allEvents;
      });
    });
    
    if (!events) return { events: [], count: 0, message: "Unable to fetch events" };
    
    return {
      events,
      count: events.length,
      message: events.length > 0 
        ? `Found ${events.length} events for today` 
        : "No events scheduled for today"
    };
  },
});

export const searchCalendarEvents = createTool<
  z.ZodObject<{
    query: z.ZodString;
    daysFromNow: z.ZodOptional<z.ZodNumber>;
  }>,
  VoiceAssistantNetworkState
>({
  name: "search_calendar_events",
  description: "Search for calendar events by keyword within a date range",
  parameters: z.object({
    query: z.string().describe("Text to search for in event titles, locations, and notes"),
    daysFromNow: z.number().optional().describe("Number of days to search ahead (default: 30)")
  }),
  handler: async ({ query, daysFromNow = 30 }, { step }) => {
    const events = await step?.run("search-calendar-events", async () => {
      return run<CalendarEvent[]>((searchText: string, days: number) => {
        const Calendar = Application("Calendar");
        const today = new Date();
        const endDate = new Date();
        endDate.setDate(today.getDate() + days);
        
        const matchingEvents: CalendarEvent[] = [];
        const calendars = Calendar.calendars();
        const searchLower = searchText.toLowerCase();
        
        for (const calendar of calendars) {
          const calendarName = calendar.name();
          const events = calendar.events.whose({
            _and: [
              { startDate: { _greaterThan: today }},
              { startDate: { _lessThan: endDate }}
            ]
          })();
          
          for (const event of events) {
            const title = event.summary() || "";
            const location = event.location() || "";
            const notes = event.description() || "";
            
            if (
              title.toLowerCase().includes(searchLower) ||
              location.toLowerCase().includes(searchLower) ||
              notes.toLowerCase().includes(searchLower)
            ) {
              matchingEvents.push({
                title,
                startDate: event.startDate().toISOString(),
                endDate: event.endDate().toISOString(),
                location: location || null,
                notes: notes || null,
                calendar: calendarName,
                isAllDay: event.alldayEvent()
              });
            }
          }
        }
        
        return matchingEvents;
      }, query, daysFromNow);
    });
    
    if (!events) return { events: [], count: 0, message: "Unable to search events" };
    
    return {
      events,
      count: events.length,
      message: events.length > 0 
        ? `Found ${events.length} events matching "${query}"` 
        : `No events found matching "${query}"`
    };
  },
});

export const createCalendarEvent = createTool<
  z.ZodObject<{
    title: z.ZodString;
    startDate: z.ZodString;
    endDate: z.ZodString;
    location: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    isAllDay: z.ZodOptional<z.ZodBoolean>;
  }>,
  VoiceAssistantNetworkState
>({
  name: "create_calendar_event",
  description: "Create a new calendar event",
  parameters: z.object({
    title: z.string().describe("Event title"),
    startDate: z.string().describe("Start date/time in ISO format"),
    endDate: z.string().describe("End date/time in ISO format"),
    location: z.string().optional().describe("Event location"),
    notes: z.string().optional().describe("Event notes/description"),
    isAllDay: z.boolean().optional().describe("Whether this is an all-day event")
  }),
  handler: async ({ title, startDate, endDate, location, notes, isAllDay }, { step }) => {
    const result = await step?.run("create-calendar-event", async () => {
      return run((eventData: any) => {
        const Calendar = Application("Calendar");
        
        // Get the default calendar
        const calendars = Calendar.calendars();
        if (calendars.length === 0) {
          throw new Error("No calendars found");
        }
        const defaultCalendar = calendars[0];
        
        // Create the event
        const newEvent = Calendar.Event({
          summary: eventData.title,
          startDate: new Date(eventData.startDate),
          endDate: new Date(eventData.endDate),
          location: eventData.location || "",
          description: eventData.notes || "",
          alldayEvent: eventData.isAllDay || false
        });
        
        defaultCalendar.events.push(newEvent);
        
        return {
          success: true,
          eventId: newEvent.uid(),
          message: `Created event "${eventData.title}"`
        };
      }, { title, startDate, endDate, location, notes, isAllDay });
    });
    
    return result;
  },
});

// Reminders Tools
export const createReminder = createTool<
  z.ZodObject<{
    title: z.ZodString;
    list: z.ZodOptional<z.ZodString>;
    dueDate: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
  }>,
  VoiceAssistantNetworkState
>({
  name: "create_reminder",
  description: "Create a new reminder",
  parameters: z.object({
    title: z.string().describe("Reminder title"),
    list: z.string().optional().describe("Reminder list name (default: 'Reminders')"),
    dueDate: z.string().optional().describe("Due date in ISO format"),
    notes: z.string().optional().describe("Additional notes")
  }),
  handler: async ({ title, list = "Reminders", dueDate, notes }, { step }) => {
    const result = await step?.run("create-reminder", async () => {
      return run((reminderData: any) => {
        const Reminders = Application("Reminders");
        
        // Find or create the list
        let targetList;
        const lists = Reminders.lists.whose({ name: reminderData.list })();
        
        if (lists.length > 0) {
          targetList = lists[0];
        } else {
          // Create new list if it doesn't exist
          targetList = Reminders.make({
            new: "list",
            withProperties: { name: reminderData.list }
          });
        }
        
        // Create reminder properties
        const reminderProps: any = {
          name: reminderData.title
        };
        
        if (reminderData.notes) {
          reminderProps.body = reminderData.notes;
        }
        
        if (reminderData.dueDate) {
          reminderProps.dueDate = new Date(reminderData.dueDate);
        }
        
        // Create the reminder
        const newReminder = Reminders.make({
          new: "reminder",
          at: targetList,
          withProperties: reminderProps
        });
        
        return {
          success: true,
          reminderId: newReminder.id(),
          message: `Created reminder "${reminderData.title}" in list "${reminderData.list}"`
        };
      }, { title, list, dueDate, notes });
    });
    
    return result;
  },
});

export const getReminders = createTool<
  z.ZodObject<{
    list: z.ZodOptional<z.ZodString>;
    includeCompleted: z.ZodOptional<z.ZodBoolean>;
  }>,
  VoiceAssistantNetworkState
>({
  name: "get_reminders",
  description: "Get reminders from a specific list or all lists",
  parameters: z.object({
    list: z.string().optional().describe("List name to filter by"),
    includeCompleted: z.boolean().optional().describe("Include completed reminders")
  }),
  handler: async ({ list, includeCompleted = false }, { step }) => {
    const reminders = await step?.run("get-reminders", async () => {
      return run<Reminder[]>((listName?: string, completed?: boolean) => {
        const Reminders = Application("Reminders");
        const allReminders: Reminder[] = [];
        
        if (listName) {
          // Get reminders from specific list
          const lists = Reminders.lists.whose({ name: listName })();
          if (lists.length > 0) {
            const targetList = lists[0];
            const reminders = completed 
              ? targetList.reminders()
              : targetList.reminders.whose({ completed: false })();
              
            for (const reminder of reminders) {
              allReminders.push({
                title: reminder.name(),
                completed: reminder.completed(),
                dueDate: reminder.dueDate() ? reminder.dueDate().toISOString() : null,
                notes: reminder.body() || null,
                list: listName
              });
            }
          }
        } else {
          // Get reminders from all lists
          const lists = Reminders.lists();
          for (const list of lists) {
            const listName = list.name();
            const reminders = completed 
              ? list.reminders()
              : list.reminders.whose({ completed: false })();
              
            for (const reminder of reminders) {
              allReminders.push({
                title: reminder.name(),
                completed: reminder.completed(),
                dueDate: reminder.dueDate() ? reminder.dueDate().toISOString() : null,
                notes: reminder.body() || null,
                list: listName
              });
            }
          }
        }
        
        return allReminders;
      }, list, includeCompleted);
    });
    
    if (!reminders) return { reminders: [], count: 0, message: "Unable to fetch reminders" };
    
    return {
      reminders,
      count: reminders.length,
      message: `Found ${reminders.length} reminders${list ? ` in "${list}"` : ""}`
    };
  },
});

// Notes Tools
export const createNote = createTool<
  z.ZodObject<{
    title: z.ZodString;
    body: z.ZodString;
    folder: z.ZodOptional<z.ZodString>;
  }>,
  VoiceAssistantNetworkState
>({
  name: "create_note",
  description: "Create a new note in Apple Notes",
  parameters: z.object({
    title: z.string().describe("Note title"),
    body: z.string().describe("Note content"),
    folder: z.string().optional().describe("Folder name (default: 'Notes')")
  }),
  handler: async ({ title, body, folder = "Notes" }, { step }) => {
    const result = await step?.run("create-note", async () => {
      return run((noteData: any) => {
        const Notes = Application("Notes");
        
        // Find or use default folder
        let targetFolder;
        const folders = Notes.folders.whose({ name: noteData.folder })();
        
        if (folders.length > 0) {
          targetFolder = folders[0];
        } else if (noteData.folder === "Notes") {
          // Use default folder
          targetFolder = Notes.defaultAccount.folders[0];
        } else {
          // Create new folder
          targetFolder = Notes.make({
            new: "folder",
            withProperties: { name: noteData.folder }
          });
        }
        
        // Create the note
        const newNote = Notes.make({
          new: "note",
          withProperties: {
            name: noteData.title,
            body: noteData.body
          },
          at: targetFolder
        });
        
        return {
          success: true,
          noteId: newNote.id(),
          message: `Created note "${noteData.title}" in folder "${noteData.folder}"`
        };
      }, { title, body, folder });
    });
    
    return result;
  },
});

export const searchNotes = createTool<
  z.ZodObject<{
    query: z.ZodString;
  }>,
  VoiceAssistantNetworkState
>({
  name: "search_notes",
  description: "Search through Apple Notes by title or content",
  parameters: z.object({
    query: z.string().describe("Search query")
  }),
  handler: async ({ query }, { step }) => {
    const notes = await step?.run("search-notes", async () => {
      return run<Note[]>((searchText: string) => {
        const Notes = Application("Notes");
        const searchLower = searchText.toLowerCase();
        const matchingNotes: Note[] = [];
        
        // Search through all notes
        const allNotes = Notes.notes();
        
        for (const note of allNotes) {
          const title = note.name() || "";
          const body = note.plaintext() || "";
          
          if (
            title.toLowerCase().includes(searchLower) ||
            body.toLowerCase().includes(searchLower)
          ) {
            matchingNotes.push({
              title,
              content: body.substring(0, 200) + (body.length > 200 ? "..." : ""),
              folder: note.container().name(),
              createdDate: note.creationDate().toISOString(),
              modifiedDate: note.modificationDate().toISOString()
            });
          }
        }
        
        return matchingNotes;
      }, query);
    });
    
    if (!notes) return { notes: [], count: 0, message: "Unable to search notes" };
    
    return {
      notes,
      count: notes.length,
      message: notes.length > 0 
        ? `Found ${notes.length} notes matching "${query}"` 
        : `No notes found matching "${query}"`
    };
  },
});

export const getNotes = createTool<
  z.ZodObject<{
    folder: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
  }>,
  VoiceAssistantNetworkState
>({
  name: "get_notes",
  description: "Get a list of notes from Apple Notes",
  parameters: z.object({
    folder: z.string().optional().describe("Filter by folder name"),
    limit: z.number().optional().describe("Maximum number of notes to return (default: 20)")
  }),
  handler: async ({ folder, limit = 20 }, { step }) => {
    const notes = await step?.run("get-notes", async () => {
      return run<Note[]>((folderName?: string, maxNotes?: number) => {
        const Notes = Application("Notes");
        const allNotes: Note[] = [];
        
        let notesToProcess;
        if (folderName) {
          const folders = Notes.folders.whose({ name: folderName })();
          if (folders.length > 0) {
            notesToProcess = folders[0].notes();
          } else {
            return [];
          }
        } else {
          notesToProcess = Notes.notes();
        }
        
        // Get the most recent notes up to the limit
        const noteCount = Math.min(notesToProcess.length, maxNotes || 20);
        
        for (let i = 0; i < noteCount; i++) {
          const note = notesToProcess[i];
          allNotes.push({
            title: note.name(),
            content: note.plaintext().substring(0, 200) + "...",
            folder: note.container().name(),
            createdDate: note.creationDate().toISOString(),
            modifiedDate: note.modificationDate().toISOString()
          });
        }
        
        return allNotes;
      }, folder, limit);
    });
    
    if (!notes) return { notes: [], count: 0, message: "Unable to fetch notes" };
    
    return {
      notes,
      count: notes.length,
      message: `Retrieved ${notes.length} notes${folder ? ` from "${folder}"` : ""}`
    };
  },
});

// Communication Tools
export const getUnreadEmails = createTool<
  z.ZodObject<{
    limit: z.ZodOptional<z.ZodNumber>;
  }>,
  VoiceAssistantNetworkState
>({
  name: "get_unread_emails",
  description: "Get unread emails from Mail app",
  parameters: z.object({
    limit: z.number().optional().describe("Maximum number of emails to return (default: 10)")
  }),
  handler: async ({ limit = 10 }, { step }) => {
    const emails = await step?.run("get-unread-emails", async () => {
      return run<Email[]>((maxEmails: number) => {
        const Mail = Application("Mail");
        const unreadEmails: Email[] = [];
        
        // Get all accounts
        const accounts = Mail.accounts();
        let emailCount = 0;
        
        for (const account of accounts) {
          if (emailCount >= maxEmails) break;
          
          const mailboxes = account.mailboxes();
          
          for (const mailbox of mailboxes) {
            if (emailCount >= maxEmails) break;
            
            // Get unread messages
            const messages = mailbox.messages.whose({ readStatus: false })();
            
            for (const message of messages) {
              if (emailCount >= maxEmails) break;
              
              unreadEmails.push({
                subject: message.subject(),
                sender: message.sender(),
                dateSent: message.dateSent().toISOString(),
                preview: message.content().substring(0, 200) + "...",
                mailbox: mailbox.name(),
                account: account.name()
              });
              
              emailCount++;
            }
          }
        }
        
        return unreadEmails;
      }, limit);
    });
    
    if (!emails) return { emails: [], count: 0, message: "Unable to fetch emails" };
    
    return {
      emails,
      count: emails.length,
      message: emails.length > 0 
        ? `Found ${emails.length} unread emails` 
        : "No unread emails"
    };
  },
});

export const sendEmail = createTool<
  z.ZodObject<{
    to: z.ZodString;
    subject: z.ZodString;
    body: z.ZodString;
    cc: z.ZodOptional<z.ZodString>;
    bcc: z.ZodOptional<z.ZodString>;
  }>,
  VoiceAssistantNetworkState
>({
  name: "send_email",
  description: "Send an email using Mail app",
  parameters: z.object({
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Email subject"),
    body: z.string().describe("Email body"),
    cc: z.string().optional().describe("CC recipients (comma-separated)"),
    bcc: z.string().optional().describe("BCC recipients (comma-separated)")
  }),
  handler: async ({ to, subject, body, cc, bcc }, { step }) => {
    const result = await step?.run("send-email", async () => {
      return run((emailData: any) => {
        const Mail = Application("Mail");
        
        // Create new message
        const message = Mail.OutgoingMessage().make();
        message.subject = emailData.subject;
        message.content = emailData.body;
        message.visible = true;
        
        // Add recipients
        const toRecipient = Mail.ToRecipient().make();
        toRecipient.address = emailData.to;
        message.toRecipients.push(toRecipient);
        
        // Add CC recipients if provided
        if (emailData.cc) {
          const ccAddresses = emailData.cc.split(',').map((addr: string) => addr.trim());
          for (const addr of ccAddresses) {
            const ccRecipient = Mail.CcRecipient().make();
            ccRecipient.address = addr;
            message.ccRecipients.push(ccRecipient);
          }
        }
        
        // Add BCC recipients if provided
        if (emailData.bcc) {
          const bccAddresses = emailData.bcc.split(',').map((addr: string) => addr.trim());
          for (const addr of bccAddresses) {
            const bccRecipient = Mail.BccRecipient().make();
            bccRecipient.address = addr;
            message.bccRecipients.push(bccRecipient);
          }
        }
        
        // Send the message
        message.send();
        
        return {
          success: true,
          message: `Email sent to ${emailData.to} with subject "${emailData.subject}"`
        };
      }, { to, subject, body, cc, bcc });
    });
    
    return result;
  },
});

export const sendMessage = createTool<
  z.ZodObject<{
    phoneNumber: z.ZodString;
    message: z.ZodString;
  }>,
  VoiceAssistantNetworkState
>({
  name: "send_message",
  description: "Send an iMessage or SMS",
  parameters: z.object({
    phoneNumber: z.string().describe("Phone number or email for iMessage"),
    message: z.string().describe("Message content")
  }),
  handler: async ({ phoneNumber, message }, { step }) => {
    const result = await step?.run("send-message", async () => {
        const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
        const escapedMessage = message.replace(/"/g, '\\"');
        
        const script = `
            tell application "Messages"
                activate
                set targetService to 1st service whose service type = iMessage
                set targetBuddy to buddy "${normalizedPhoneNumber}" of targetService
                send "${escapedMessage}" to targetBuddy
            end tell
        `;
        
        try {
            await runAppleScript(script);
            return {
                success: true,
                message: `Message sent to ${phoneNumber}`
            };
        } catch (error) {
            console.error("Failed to send message via AppleScript:", error);
            if (error instanceof Error) {
                throw new Error(`Failed to send message: ${error.message}`);
            }
            throw new Error("An unknown error occurred while sending the message.");
        }
    });
    
    return result;
  },
});

export const findContact = createTool<
  z.ZodObject<{
    name: z.ZodString;
  }>,
  VoiceAssistantNetworkState
>({
  name: "find_contact",
  description: "Look up contact information by name",
  parameters: z.object({
    name: z.string().describe("Contact name to search for")
  }),
  handler: async ({ name }, { step }) => {
    const contacts = await step?.run("find-contact", async () => {
      return run<Contact[]>((searchName: string) => {
        const Contacts = Application("Contacts");
        const matchingContacts: Contact[] = [];
        
        // Search for contacts
        const people = Contacts.people.whose({
          name: { _contains: searchName }
        })();
        
        for (const person of people) {
          const contact: Contact = {
            name: person.name(),
            phones: [],
            emails: [],
            organization: undefined
          };
          
          // Get phone numbers
          const phones = person.phones();
          for (const phone of phones) {
            contact.phones.push({
              label: phone.label(),
              value: phone.value()
            });
          }
          
          // Get email addresses
          const emails = person.emails();
          for (const email of emails) {
            contact.emails.push({
              label: email.label(),
              value: email.value()
            });
          }
          
          // Get organization if available
          try {
            contact.organization = person.organization();
          } catch (e) {
            // Not all contacts have organizations
          }
          
          matchingContacts.push(contact);
        }
        
        return matchingContacts;
      }, name);
    });
    
    if (!contacts) return { contacts: [], count: 0, message: "Unable to find contacts" };
    
    return {
      contacts,
      count: contacts.length,
      message: contacts.length > 0 
        ? `Found ${contacts.length} contacts matching "${name}"` 
        : `No contacts found matching "${name}"`
    };
  },
});

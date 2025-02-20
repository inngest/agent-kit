"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { inngest } from "./inngest/client";

export async function importContacts(contacts: any[]) {
  return await inngest.send({
    name: "contacts.import",
    data: {
      contacts,
    },
  });
}

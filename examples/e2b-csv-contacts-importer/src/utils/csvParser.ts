import { Contact, ColumnMapping } from "@/types/contact";

export const parseCSV = async (
  file: File,
  mapping: ColumnMapping
): Promise<Contact[]> => {
  const text = await file.text();
  const lines = text.split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());

  const contacts: Contact[] = [];

  console.log(headers);
  console.log(lines);
  console.log(mapping);

  const mappingToValuesIndex = Object.entries(mapping).reduce(
    (acc, [key, value]) => {
      // @ts-expect-error bruh
      acc[key] = headers.indexOf(value);
      return acc;
    },
    {} as Record<keyof ColumnMapping, number>
  );

  console.log("mappingToValuesIndex", mappingToValuesIndex);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(",").map((v) => v.trim());
    const contact: Partial<Contact> = {};

    Object.entries(mapping).forEach(([key, value]) => {
      // @ts-expect-error bruh
      if (headers[mappingToValuesIndex[key]] === value) {
        // @ts-expect-error bruh
        contact[key] = values[mappingToValuesIndex[key]];
      }
    });

    if (contact.fullName && contact.email) {
      contacts.push(contact as Contact);
    }
  }

  return contacts;
};

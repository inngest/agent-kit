import { Contact } from "@/types/contact";

interface ContactListProps {
  contacts: Contact[];
}

export default function ContactList({ contacts }: ContactListProps) {
  if (contacts.length === 0) {
    return null;
  }

  return (
    <div className="mt-8">
      <h2 className="text-xl font-semibold mb-4 text-gray-100">
        Imported Contacts ({contacts.length})
      </h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {contacts.map((contact, index) => (
          <div
            key={contact.id || index}
            className="p-4 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-750 transition-colors group"
          >
            <div className="font-medium text-gray-100">{contact.fullName}</div>
            <div className="text-sm text-gray-400 mt-1">{contact.email}</div>
            {contact.position && (
              <div className="text-sm text-gray-400">{contact.position}</div>
            )}
            {contact.company && (
              <div className="mt-2 text-sm text-gray-500 group-hover:text-gray-400 transition-colors">
                {contact.company}
              </div>
            )}
            {
              <div className="mt-2 text-xs px-2 py-1 rounded-full bg-gray-700 text-gray-300 inline-block">
                Ranking: {contact.ranking}
              </div>
            }
          </div>
        ))}
      </div>
    </div>
  );
}


export enum ModuleType {
  VOICE = 'voice',
  STUDY = 'study',
  COMMUNICATION = 'communication',
  NOTIFICATIONS = 'notifications',
  MULTIMEDIA = 'multimedia'
}

export interface Note {
  id: string;
  title: string;
  content: string;
  date: string;
}

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  category: 'study' | 'personal' | 'work';
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  avatar: string;
}

export interface Message {
  id: string;
  contactId: string;
  text: string;
  timestamp: string;
  incoming: boolean;
}

export interface AppNotification {
  id: string;
  app: 'WhatsApp' | 'Instagram' | 'Slack';
  sender: string;
  content: string;
  timestamp: string;
}

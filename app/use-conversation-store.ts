import { useSyncExternalStore, useCallback } from "react";
import {
  getSessionStore,
  subscribeSessionStore,
  setSessionStore,
} from "./session-store";
import { Message } from "./actions";

const useConversationStore = () => {
  const conversation = useSyncExternalStore(
    subscribeSessionStore,
    getSessionStore("conversation"),
    () => "[]"
  );

  const setConversation = useCallback((messages: Message[]) => {
    setSessionStore("conversation", messages);
  }, []);

  return { conversation, setConversation };
};

export default useConversationStore;

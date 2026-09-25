import { useEffect, useState } from "react";
import { Button, ScrollView, Text, TextInput, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { exportLocalFirstSecret } from "jazz-tools";
import {
  JazzSessionProvider,
  useJazzSessionOwner,
  useDb,
  useAll,
} from "jazz-tools/expo";
import { app } from "./schema";
const auth = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_AUTH_URL ?? "http://127.0.0.1:3005",
  plugins: [
    expoClient({
      scheme: "jazztickrepro",
      storagePrefix: "jazztickrepro",
      storage: SecureStore,
    }),
  ],
});
async function getToken() {
  const response = await auth.$fetch<{ token: string }>("/token");
  if (!response.data?.token)
    throw new Error(response.error?.message ?? "Missing token");
  console.log("[repro] Better Auth token obtained");
  return response.data.token;
}
const secretKey = "jazz-tick-repro-local-root";
export default function App() {
  const { session, error } = useJazzSessionOwner({
    appId:
      process.env.EXPO_PUBLIC_JAZZ_APP_ID ??
      "019a0000-0000-7000-8000-000000000056",
    serverUrl:
      process.env.EXPO_PUBLIC_JAZZ_SERVER_URL ?? "http://127.0.0.1:1625",
    env: "dev",
  });
  const [ready, setReady] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  function select() {
    const account = session?.getSnapshot().account;
    if (!account) throw new Error("No selected account");
    setAccountId(account.id);
    setReady(true);
    console.log("[repro] account ready", new Date().toISOString());
  }
  useEffect(() => {
    if (!session) return;
    void SecureStore.getItemAsync(secretKey)
      .then(async (secret) => {
        if (secret) {
          await session.restoreLocalFirst(secret);
          select();
        }
      })
      .catch((e) => setStatus(String(e)));
  }, [session]);
  async function signIn(signup: boolean) {
    if (!session) return;
    try {
      const response = signup
        ? await auth.signUp.email({ email, password, name: "Repro" })
        : await auth.signIn.email({ email, password });
      if (response.error) throw new Error(response.error.message);
      await session.loginOrRegisterJWT({ getToken });
      select();
    } catch (e) {
      setStatus(String(e));
    }
  }
  async function local() {
    if (!session) return;
    try {
      await session.createLocalFirst();
      const account = session.getSnapshot().account!;
      await SecureStore.setItemAsync(
        secretKey,
        exportLocalFirstSecret(account),
      );
      select();
    } catch (e) {
      setStatus(String(e));
    }
  }
  const login = (
    <View style={{ gap: 12 }}>
      <Text>Jazz tick reproduction</Text>
      <TextInput
        testID="email"
        placeholder="Email"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        testID="password"
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Button
        title="Sign in with Better Auth"
        onPress={() => void signIn(false)}
      />
      <Button
        title="Create Better Auth account"
        onPress={() => void signIn(true)}
      />
      <Button
        title="Create local-first account (control)"
        onPress={() => void local()}
      />
      <Text>{String(error ?? status)}</Text>
    </View>
  );
  return (
    <View style={{ flex: 1, padding: 24, paddingTop: 54 }}>
      {session ? (
        <JazzSessionProvider session={session} fallback={login}>
          {ready ? <Todos accountId={accountId} /> : login}
        </JazzSessionProvider>
      ) : (
        login
      )}
    </View>
  );
}
function Todos({ accountId }: { accountId: string }) {
  const db = useDb();
  const todos = useAll(app.todos);
  const [selected, setSelected] = useState<string>();
  const subtasks = useAll(
    selected ? app.subtasks.where({ todoId: selected }) : undefined,
  );
  const todo = todos.data?.find((t) => t.id === selected);
  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Text>Todos — leave this screen idle to test</Text>
      <Button
        title="Add todo"
        onPress={() => {
          const write = db.insert(app.todos, {
            ownerId: accountId,
            title: "New todo",
            done: false,
          });
          setSelected(write.value.id);
        }}
      />
      {todos.data?.map((t) => (
        <Button
          key={t.id}
          title={t.title || "(empty)"}
          onPress={() => setSelected(t.id)}
        />
      ))}
      {todo && (
        <View style={{ gap: 12 }}>
          <TextInput
            testID="todo-title"
            accessibilityLabel="Todo title"
            value={todo.title}
            onChangeText={(title) => db.update(app.todos, todo.id, { title })}
          />
          <Button
            title={todo.done ? "Mark todo incomplete" : "Complete todo"}
            onPress={() => db.update(app.todos, todo.id, { done: !todo.done })}
          />
          <Button
            title="Add subtask"
            onPress={() =>
              db.insert(app.subtasks, {
                ownerId: accountId,
                todoId: todo.id,
                title: "New subtask",
                done: false,
              })
            }
          />
          {subtasks.data?.map((s) => (
            <View key={s.id}>
              <TextInput
                accessibilityLabel="Subtask title"
                value={s.title}
                onChangeText={(title) =>
                  db.update(app.subtasks, s.id, { title })
                }
              />
              <Button
                title={s.done ? "Undo subtask" : "Complete subtask"}
                onPress={() => db.update(app.subtasks, s.id, { done: !s.done })}
              />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

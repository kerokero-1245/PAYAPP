"use client";

import { useEffect, useRef, useState } from "react";
import DemoNote from "@/components/ui/DemoNote";
import FormField from "@/components/ui/FormField";
import Button from "@/components/ui/Button";
import StatusMessage from "@/components/ui/StatusMessage";
import InfoList from "@/components/ui/InfoList";
import {
  CONTACT_FIELDS,
  CONTACT_LIMITS,
  CONTACT_TOPICS,
  EMPTY_CONTACT,
  countChars,
  validateContact,
  validateContactField,
} from "@/lib/contact";

const DEMO_NOTE =
  "このサイトはポートフォリオ用のデモです。入力内容はどこにも送信・保存されません（このブラウザにも残りません）。";

/**
 * お問い合わせフォーム（デモ）
 * ---------------------------------------------------
 * 検証は lib/contact.ts の純粋関数。送信ボタンで全項目を検証し、以後は欄を離れるたびにその欄を検証する。
 * エラーがあれば先頭のエラー欄へフォーカスを移す（エラー文と aria-describedby が描かれた後に移す）。
 * 検証が通っても fetch も保存もせず、「受け付けました（デモ）」の表示に切り替えるだけ。
 * 切り替えたら、その見出しへフォーカスを移し（ボタンが消えてフォーカスが body に落ちないように）、
 * 結果の領域は role="status" で読み上げる。
 */
export default function ContactForm() {
  const [values, setValues] = useState(EMPTY_CONTACT);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [sent, setSent] = useState(null);
  /** フォーカスを移す欄（送信のたびに新しいオブジェクトにして、同じ欄でも effect を走らせる） */
  const [focusField, setFocusField] = useState(null);
  const formRef = useRef(null);
  const sentTitleRef = useRef(null);

  useEffect(() => {
    if (focusField) formRef.current?.elements.namedItem(focusField.name)?.focus();
  }, [focusField]);

  useEffect(() => {
    if (sent) sentTitleRef.current?.focus();
  }, [sent]);

  const change = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));
  const blur = (field) => () => {
    if (!submitted) return;
    setErrors((prev) => ({ ...prev, [field]: validateContactField(field, values) }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    const result = validateContact(values);
    setErrors(result.errors);
    if (!result.ok) {
      setFocusField({ name: CONTACT_FIELDS.find((f) => result.errors[f]) });
      return;
    }
    setSent(values);
  };

  const reset = () => {
    setValues(EMPTY_CONTACT);
    setErrors({});
    setSubmitted(false);
    setSent(null);
  };

  if (sent) {
    const topic = CONTACT_TOPICS.find((t) => t.value === sent.topic)?.label;
    return (
      <StatusMessage
        contained={false}
        role="status"
        titleRef={sentTitleRef}
        titleAs="h2"
        icon="check"
        eyebrow="Thank you"
        title="送信内容を受け付けました（デモ）"
        lead={DEMO_NOTE}
        actions={
          <>
            <Button onClick={reset}>別の内容で問い合わせる</Button>
            <Button href="/" variant="outline">
              トップへ戻る
            </Button>
          </>
        }
      >
        <InfoList
          className="mt-8 text-left"
          items={[
            { term: "お名前", desc: sent.name.trim() },
            { term: "メールアドレス", desc: sent.email.trim() },
            { term: "種別", desc: topic },
            ...(sent.orderId.trim() ? [{ term: "注文番号", desc: sent.orderId.trim().toUpperCase() }] : []),
            { term: "お問い合わせ内容", desc: sent.message.trim() },
          ]}
        />
      </StatusMessage>
    );
  }

  return (
    <>
      <DemoNote className="animate-fade-in">{DEMO_NOTE}</DemoNote>

      <form ref={formRef} onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-6">
        <FormField
          id="name"
          label="お名前"
          required
          autoComplete="name"
          value={values.name}
          onChange={change("name")}
          onBlur={blur("name")}
          error={errors.name}
          maxLength={CONTACT_LIMITS.nameMax + 10}
        />
        <FormField
          id="email"
          label="メールアドレス"
          required
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={values.email}
          onChange={change("email")}
          onBlur={blur("email")}
          error={errors.email}
        />
        <FormField
          id="topic"
          as="select"
          label="種別"
          value={values.topic}
          onChange={change("topic")}
          onBlur={blur("topic")}
          error={errors.topic}
        >
          {CONTACT_TOPICS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </FormField>
        <FormField
          id="orderId"
          label="注文番号（任意）"
          placeholder="ORD-XXXXXX"
          hint="注文履歴に出ている「ORD-」で始まる番号です。"
          value={values.orderId}
          onChange={change("orderId")}
          onBlur={blur("orderId")}
          error={errors.orderId}
        />
        <FormField
          id="message"
          as="textarea"
          label="お問い合わせ内容"
          required
          rows={6}
          hint={`${CONTACT_LIMITS.messageMin}〜${CONTACT_LIMITS.messageMax} 文字（いま ${countChars(values.message.trim())} 文字）`}
          value={values.message}
          onChange={change("message")}
          onBlur={blur("message")}
          error={errors.message}
        />
        <Button type="submit" block className="mt-2">
          送信する（デモ）
        </Button>
      </form>
    </>
  );
}

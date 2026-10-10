CREATE TABLE "order_items" (
	"order_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"unit_price" integer NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "order_items_pkey" PRIMARY KEY("order_id","product_id"),
	CONSTRAINT "order_items_quantity_range" CHECK ("order_items"."quantity" between 1 and 99),
	CONSTRAINT "order_items_unit_price_nonnegative" CHECK ("order_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_no" text NOT NULL,
	"user_id" text,
	"stripe_session_id" text NOT NULL,
	"status" text NOT NULL,
	"total" integer NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_no_unique" UNIQUE("order_no"),
	CONSTRAINT "orders_stripe_session_id_unique" UNIQUE("stripe_session_id"),
	CONSTRAINT "orders_total_nonnegative" CHECK ("orders"."total" >= 0),
	CONSTRAINT "orders_status_valid" CHECK ("orders"."status" in ('paid', 'pending', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"price" integer NOT NULL,
	"stock" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_price_nonnegative" CHECK ("products"."price" >= 0),
	CONSTRAINT "products_stock_nonnegative" CHECK ("products"."stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
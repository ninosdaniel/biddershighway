Rails.application.routes.draw do
  mount Fuik::Engine => "/webhooks"
  mount MissionControl::Jobs::Engine, at: "/jerbs"
  resources :debug_logins, only: :create if Rails.env.development?
  mount Lookbook::Engine, at: "/lookbook" if Rails.env.development?

  resources :locales, only: [], param: :locale do
    post :set, on: :member
  end

  # The sitemap lives in object storage; these redirect to it so the canonical
  # URLs stay on our own domain. /sitemap.xml is where crawlers look first.
  get "sitemap.xml", to: "sitemaps#show", as: :sitemap, format: false
  get "sitemaps/:filename", to: "sitemaps#show", as: :sitemap_file, format: false,
                            constraints: { filename: /sitemap-[a-z-]+-\d+\.xml\.gz/ }

  resources :auction_feeds, only: :show
  resources :feeds, only: :index, path: "feed"

  # Outside the locale scope: a mail client fetches this as an image, and a QR code has no language.
  resources :swish_qr_codes, only: :show

  # Swish POSTs here. Outside the locale scope for the same reason, and unauthenticated because
  # Swish signs nothing — the controller re-asks Swish rather than believing the body.
  resources :swish_callbacks, only: :create

  get "filter", to: redirect("/filter/dashboard")
  get "dealen", to: redirect("/sv/sales_inquiries/new?from=dealen")
  get "fotoerbjudande", to: redirect("/sv/sales_inquiries/new?from=fotoerbjudande")

  namespace :filter do
    resources :rich_text_uploads, only: :create
    resources :blocket_classifieds, only: %i[index create destroy]
    resources :multi_blocket_classifieds, only: :create

    resources :albums do
      resources :photo_completions, module: "albums", only: :create
    end
    resources :auctions do
      resources :bid_adjustments, module: "auctions", only: :create
      resources :comment_denials, module: "auctions", only: :create
    end
    resources :authors
    resources :blog_posts do
      resources :duplications, module: "blog_posts", only: :create
    end
    resources :comments do
      resource :rejection, module: "comments", only: :update
    end
    resources :classifieds do
      resources :email_approvals, module: "classifieds", only: :create
    end
    resources :customizable_emails
    resource :dashboard, only: %i[show]
    resources :fortnox_integrations, only: %i[index new]
    resource :sales_dashboard, only: %i[show]
    resource :sales_referral_qr_code, only: :show
    resources :invoices, only: :update
    namespace :leads do
      resources :from_registration_numbers, only: :create
    end
    resources :leads do
      resources :archivals, module: "leads", only: :create
      resources :classified_mailings, module: "leads", only: :create
      resources :dropbox_links, module: "leads", only: :create
      resources :fortnox_invoices, module: "leads", only: :index
      resources :lotifications, module: "leads", only: :create
      resources :photo_op_bookings, module: "leads", only: :create
      resources :photographer_candidates, module: "leads", only: :index
      resource :self_shot_photo_op_booking, module: "leads", only: :create
      resources :pipedrive_syncs, module: "leads", only: :create
    end
    resources :questionnaires
    resources :lots do
      resources :auctionizations, only: :create, module: "lots"
      resources :classifiedizations, only: :create, module: "lots"
      resources :generated_texts, only: :create, module: "lots"
      resources :photo_downloads, only: :create, module: "lots"
      resources :translated_texts, only: :create, module: "lots"
      resources :video_downloads, only: :show, module: "lots"
    end
    resources :manual_sales, only: :update
    resources :max_bids
    resources :pages
    resources :photo_ops
    resources :photographers
    resources :offers
    resources :questions
    resources :relations
    resources :reported_auctions, except: :show
    resources :sales_reports do
      resources :pdfs, module: "sales_reports", only: :create
    end
    resources :search_indexes, only: :create
    resources :brands
    resources :vehicle_models
    resources :themes
    resources :users do
      resources :anonymizations, module: "users", only: :create
    end
    resources :valuations, except: %i[new create]
  end

  namespace :admin do
    resources :leads, only: %i[index show new create] do
      resource :contact, only: %i[new create], module: "leads"
      resource :agreement, only: %i[new create], module: "leads"
      resource :verification_request, only: :create, module: "leads"
      resource :form, only: %i[new create], module: "leads"
      resources :form_reminders, only: :create, module: "leads"
      resources :generated_texts, only: :create, module: "leads"
      resource :text, only: %i[edit update], module: "leads"
      resources :translated_texts, only: :create, module: "leads"
      resources :albums, only: %i[index show create], module: "leads"
      resources :photo_bookings, only: %i[new create], module: "leads"
      resource :self_shot_photo_booking, only: %i[new create], module: "leads"
      resource :photo_review, only: %i[new create], module: "leads" do
        resources :albums, only: :show, module: "photo_reviews"
      end
      resource :approval, only: %i[new create], module: "leads"
      resources :publications, only: :create, module: "leads"
      resource :churn, only: %i[new create], module: "leads"
      resources :comments, only: %i[index create], module: "leads"
    end
  end

  namespace :nineteen_eighty_four, path: "1984" do
    root "unassigned_leads#index"
    resources :handlers, only: %i[index show]
    resource :throughput, only: :show
    resources :leads, only: [] do
      resource :assignment, only: :create, module: "leads"
      resource :denial, only: :create, module: "leads"
    end
  end

  namespace "cli" do
    resources :sms_texts, only: :create do
      get :docs, on: :collection
    end

    resources :lots, except: %i[edit new] do
      get :docs, on: :collection
      resources :auctionizations, only: :create, module: "lots" do
        get :docs, on: :collection
      end
      resources :generated_texts, only: :create, module: "lots" do
        get :docs, on: :collection
      end
    end

    resources :comments, except: %i[edit new] do
      get :docs, on: :collection
      resources :rejections, only: :create, module: "comments" do
        get :docs, on: :collection
      end
    end

    resources :questionnaires, only: %i[index show update] do
      get :docs, on: :collection
    end

    resources :sales_reports, except: %i[edit new] do
      get :docs, on: :collection
      resources :pdfs, only: :create, module: "sales_reports" do
        get :docs, on: :collection
      end
    end

    resources :authors, only: %i[index show] do
      get :docs, on: :collection
    end

    resources :fortnox_invoices, only: %i[index show] do
      get :docs, on: :collection
    end

    %i[albums auctions blog_posts brands classifieds images leads pages photo_ops photographers questions
       reported_auctions users valuations].each do |resource|
      resources resource, except: %i[edit new] do
        get :docs, on: :collection
      end
    end
  end

  namespace "api" do
    resources :lots, only: %i[index show]
    resources :reported_auction_searches, only: :create
    resources :sales, only: %i[index]
    resources :sales_reports, only: :create
    resources :photo_verifications, only: %i[show]

    namespace :llm do
      resource :sales_report_toolkit, only: :show
    end
  end

  namespace :accounting do
    resources :invoices, only: %i[index show]
    resources :monthly_invoices, only: %i[index show] do
      resources :downloads, module: "monthly_invoices", only: :create
    end
    resources :monthly_photo_fees, only: :show do
      resources :downloads, module: "monthly_photo_fees", only: :create
    end
  end

  # Photo management is shared by the admin lead flow, the photographer photo op and the seller's own
  # classified. It lives outside the locale scope so the admin and public bundles reach the same endpoints,
  # and it answers in turbo streams only, which is what keeps it independent of the hosting screen.
  resources :lots, only: [] do
    resource :hero_image, only: %i[create destroy], module: "lots"
    resources :albums, only: [], module: "lots" do
      resources :images, only: %i[create update destroy], module: "albums"
      resources :image_orders, only: :create, module: "albums"
    end
  end

  resources :slack_events, only: :create
  resources :slack_interactions, only: :create
  resources :turbo_frames

  get "/p/:slug", to: "short_photo_ops#show", as: :short_photo_op

  scope "/:locale" do
    resources :album_redirects, only: :show, path: "albums"
    # Listings mixes auctions and classifieds and has the richer search, so the auction-only pages that came
    # before it send their links there.
    auction_filter_queries = {
      "all" => { kind: "auction" }, "live" => { lifecycle_status: "live" },
      "coming_soon" => { lifecycle_status: "coming_soon" }, "sold" => { lifecycle_status: "sold" }, "purchasable" => {}
    }
    get "auctions", to: redirect("/%{locale}/listings")
    get "auction_filters/:id", to: redirect { |params, _request|
      query = auction_filter_queries.fetch(params[:id]).to_query
      "/#{params[:locale]}/listings#{"?#{query}" if query.present?}"
    }, constraints: { id: Regexp.union(auction_filter_queries.keys) }
    resources :auctions, only: :show do
      resources :after_sales, only: %i[create new]
      scope module: :auctions do
        resources :albums, only: %i[index show] do
          resources :images, only: :show, module: :albums
        end
      end
      resources :bookmarks, only: %i[create destroy]
      resources :max_bids, only: %i[create new]
      resources :offers, only: %i[create new]
      resources :offer_acceptances, only: %i[create new]
      resources :offer_rejections, only: %i[create new]
      resources :purchases, only: %i[create new]
      resources :saved_searches, only: :create, module: :auctions
      resources :seller_approvals, only: %i[create new]
      resources :seller_denials, only: :create
      resource :preview, only: %i[show], module: :auctions

      scope module: "auctions" do
        resources :calendar_events, only: %i[new]
      end
    end

    resources :after_sales, only: :show
    resources :ads, only: %i[index show]
    resources :auction_updates, only: :show
    resources :listing_updates, only: :index
    resources :authors, only: :show
    resources :blog_posts, only: %i[index show], path: "posts"
    resources :cars, only: %i[index show], controller: "brands", as: :car_brands, defaults: { vehicle_type: "car" }
    resources :motorcycles, only: %i[index show], controller: "brands", as: :motorcycle_brands,
                            defaults: { vehicle_type: "motorcycle" }
    get "cars/:brand_id/:id", to: "vehicle_models#show", as: :car_vehicle_model, defaults: { vehicle_type: "car" }
    get "motorcycles/:brand_id/:id", to: "vehicle_models#show", as: :motorcycle_vehicle_model,
                                     defaults: { vehicle_type: "motorcycle" }
    get "brands", to: redirect("/%{locale}/cars")
    resources :brand_redirects, only: :show, path: "brands"
    resources :blocketizations, only: %i[new create]
    resources :classifieds, only: %i[index show], param: :slug do
      resource :approval, only: %i[new create], module: :classifieds
      resources :conversations, only: %i[new create]
      scope module: :classifieds do
        resources :albums, only: %i[index show] do
          resources :images, only: :show
        end
      end
    end
    resources :pages, only: %i[index show]

    # Paying a Fortnox invoice. `invoices` rather than `fortnox_invoices` because which ledger issued
    # it is none of the payer's business, and the id is the capability: the link is mailed out, and
    # there is no account the invoice hangs off.
    resources :invoices, only: [] do
      resource :payment, only: :show, module: :invoices
      resource :pdf, only: :show, module: :invoices
      resources :swish_payment_requests, only: :create, module: :invoices
    end
    resources :swish_payment_requests, only: [] do
      scope module: :swish_payment_requests do
        resource :cancellation, only: :create
        resource :qr_code, only: :show
      end
    end
    resources :photo_offers, only: %i[edit update]
    resources :photo_ops, only: :show do
      resource :completion, only: :create, module: "photo_ops"
      resources :albums, only: %i[show create update], module: "photo_ops"
      resource :video_uploads, only: %i[show create], module: "photo_ops"
      resources :video_uploads, only: :destroy, module: "photo_ops"
    end
    resources :bimmers_leads, only: %i[new create], path: "bimmers"
    resources :classified_leads, only: %i[new create]
    resources :collection_leads, only: %i[new create]
    resources :elmia_auctions, only: %i[index show]
    resources :estate_leads, only: %i[new create], path: "estate-sales"
    resources :comments, only: %i[new create]
    resources :docs, only: :show
    resources :invitations, only: :show
    get "/jobs", to: redirect("https://biddershighway.uhigher.com")
    resources :newsletter_signups, only: :create
    namespace :google_oauth do
      resource :session, only: :create
    end
    resources :lead_approvals, only: :show
    resources :lead_reactivations, only: :show, path: "my-vehicle", as: :my_vehicle do
      resource :confirmation, only: :create, module: "lead_reactivations"
      resource :correction, only: :create, module: "lead_reactivations"
    end
    resources :leads, only: %i[new create], path: "sales_inquiries" do
      resources :auction_form_submissions, only: :update
      resources :auction_forms, except: %i[create destroy index]
      resources :calendar_bookings, only: %i[new create]
      resources :lead_forms, only: %i[new edit update]
      resources :questionnaires, only: %i[new edit update]
    end
    get "valuations/new", to: "leads#new", as: :new_valuation_lead
    post "valuations", to: "leads#create", as: :valuation_leads
    resources :valuations, path: "free_valuations", except: %i[index destroy]
    resources :detailed_leads, only: %i[edit update]
    resources :detailed_lead_uploads, only: %i[destroy update]
    resources :listings, only: :index
    resources :preview_lots, only: :show do
      scope module: :preview_lots do
        resources :albums, only: %i[index show] do
          resources :images, only: :show, module: :albums
        end
      end
    end
    resources :notifications, only: %i[index destroy]
    resources :post_previews, only: %i[show]
    resources :qr_codes, only: %i[new show destroy]
    resources :questions, only: %i[index show]
    resources :question_categories, only: %i[show]
    resources :saved_searches, only: %i[create show edit destroy]
    resources :sign_ins, only: %i[new create show destroy]
    resources :terms, only: %i[edit update]
    resources :collectible_cars, only: %i[edit update]
    resources :signup_leads, only: %i[new create]
    resource :sms_acceptance, only: %i[show create]

    resources :themes, only: :show
    resources :unsubscriptions, only: %i[show destroy] do
      resource :one_click, only: :create, module: :unsubscriptions
      resource :welcome_series, only: %i[show destroy], module: :unsubscriptions
    end
    resources :users, only: %i[new create]

    namespace :account do
      resources :bookmarks, only: %i[index destroy]
      resources :buyer_live_auctions, only: :index
      resources :buyer_lost_auctions, only: :index
      resources :buyer_won_auctions, only: %i[index show]
      resources :classifieds, only: %i[index show new create edit update] do
        scope module: :classifieds do
          resources :albums, only: %i[show create]
          resources :hidings, only: :create
          resources :moderations, only: :create
          resources :publishings, only: :create
          resources :sellings, only: :create
        end
      end
      resources :companies, only: %i[edit update]
      resources :saved_searches, only: %i[index destroy]
      resources :conversations, only: %i[index show]
      resources :conversation_messages, only: :create
      resources :seller_draft_auctions, only: :index
      resources :seller_live_auctions, only: :index
      resources :seller_concluded_auctions, only: %i[index show]
      resources :emails, only: %i[new create edit update]
      resources :settings, only: %i[edit update]
      resources :transports, only: %i[new create]
      resources :users, only: %i[edit update]
      namespace :verifications do
        resource :address, only: %i[new create]
      end
      resources :verifications, only: %i[index new create]
    end

    namespace :classified_flow do
      resources :classified_leads, only: %i[new create]
      resources :classified_lots, only: [], as: :lot do
        resources :classifieds, only: %i[new create]
      end
      resources :classified_previews, only: :new
    end

    get "/", to: "listings#index", as: :locale_root
  end

  root "listings#index"
end

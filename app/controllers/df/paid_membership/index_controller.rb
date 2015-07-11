require_dependency 'application_controller'
module ::Df::PaidMembership
	class IndexController < ::ApplicationController
		skip_before_filter :authorize_mini_profiler,
			:check_xhr,
			:inject_preview_style,
			:preload_json,
			:redirect_to_login_if_required,
			:set_current_user_for_logs,
			:set_locale,
			:set_mobile_view,
			:verify_authenticity_token, only: [:ipn, :success]
		protect_from_forgery :except => [:ipn, :success]
		before_filter :paypal_set_sandbox_mode_if_needed, only: [:buy, :ipn, :success]
		def index
			begin
				# http://guides.rubyonrails.org/active_record_basics.html

				if current_user
					invoices = Invoice.where(user_id: current_user.id)
					puts "!!!!!!!!!INVOICES!!!!!!!!!!!"
					invoices.each do |invoice|
						puts invoice.created_at
					end
				end

				plans = JSON.parse(SiteSetting.send '«Paid_Membership»_Plans')
			rescue JSON::ParserError => e
				plans = []
			end
			render json: { plans: plans }
		end
		def buy
			Airbrake.notify(:error_message => 'Purchase started', :parameters => params)
			plans = JSON.parse(SiteSetting.send '«Paid_Membership»_Plans')
			plan = nil
			planId = params['plan']
			plans.each { |p|
				if planId == p['id']
					plan = p
					break
				end
			}
			tier = nil
			tierId = params['tier']
			plan['priceTiers'].each { |t|
				if tierId == t['id']
					tier = t
					break
				end
			}
			price = tier['price']
			currency = SiteSetting.send '«PayPal»_Payment_Currency'
			user = User.find_by(id: params['user'])
			invoice = Invoice.new
			invoice.user = user
			invoice.plan_id = planId
			invoice.tier_id = tierId
			invoice.tier_period = tier['period']
			invoice.tier_period_units = tier['periodUnits']
			invoice.price = price
			invoice.currency = currency
			invoice.granted_group_ids = plan['grantedGroupIds'].join(',')
			invoice.payment_method = 'PayPal'
			invoice.save
			paypal_options = {
				no_shipping: true, # if you want to disable shipping information
				allow_note: false, # if you want to disable notes
				pay_on_paypal: true # if you don't plan on showing your own confirmation step
			}
			description =
				"Membership Plan: #{plan['title']}." +
				" User: #{user.username}." +
				" Period: #{tier['period']} #{tier['periodUnits']}."
			paymentRequestParams = {
				:action => 'Sale',
				:currency_code => currency,
				:description => description,
				:quantity => 1,
				:amount => price,
				:notify_url => "#{Discourse.base_url}/plans/ipn",
				:invoice_number => invoice.id
			}
			Airbrake.notify(
				:error_message => 'Регистрация платежа в PayPal',
				:error_class => 'plans#buy',
				:parameters => paymentRequestParams
			)
			payment_request = Paypal::Payment::Request.new paymentRequestParams
	# https://developer.paypal.com/docs/classic/express-checkout/gs_expresscheckout/
	# https://developer.paypal.com/docs/classic/api/merchant/SetExpressCheckout_API_Operation_NVP/
			response = paypal_express_request.setup(
				payment_request,
				# после успешной оплаты
				# покупатель будет перенаправлен на свою личную страницу
				"#{Discourse.base_url}/plans/success",
				# в случае неупеха оплаты
				# покупатель будет перенаправлен обратно на страницу с тарифными планами
				"#{Discourse.base_url}/plans",
				paypal_options
			)
			Airbrake.notify(
				:error_message => 'Ответ PayPal на регистрацию',
				:error_class => 'plans#buy',
				:parameters => {redirect_uri: response.redirect_uri}
			)
			render json: { redirect_uri: response.redirect_uri }
		end
		def ipn
			no_cookies
			Airbrake.notify(
				:error_message => 'Оповещение о платеже из PayPal',
				:error_class => 'plans#ipn',
				:parameters => params
			)
			Paypal::IPN.verify!(request.raw_post)
			render :nothing => true
		end
		def success
			Airbrake.notify(
				:error_message => '[success] 1',
				:error_class => 'plans#success',
				:parameters => params
			)
	# https://developer.paypal.com/docs/classic/api/merchant/GetExpressCheckoutDetails_API_Operation_NVP/
	# https://github.com/nov/paypal-express/wiki/Instant-Payment
			detailsRequest = paypal_express_request
			details = detailsRequest.details(params['token'])
			Airbrake.notify(
				:error_message => 'details response',
				:parameters => {details: details.inspect}
			)
			invoice = Invoice.find_by(id: details.invoice_number)
			payment_request = Paypal::Payment::Request.new({
				:action => 'Sale',
				:currency_code => invoice.currency,
				:amount => details.amount
			})
	# https://developer.paypal.com/docs/classic/api/merchant/DoExpressCheckoutPayment_API_Operation_NVP/
	# https://gist.github.com/xcommerce-gists/3502241
			response = paypal_express_request.checkout!(
				params['token'],
				params['PayerID'],
				payment_request
			)
			# http://stackoverflow.com/a/18811305/254475
			currentTime = DateTime.current
			invoice.paid_at = DateTime.current
			case invoice.tier_period_units
				when 'y'
					advanceUnits = :years
				when 'm'
					advanceUnits = :months
				when 'd'
					advanceUnits = :days
			end
			invoice.membership_till = DateTime.current.advance(advanceUnits => +invoice.tier_period)
			invoice.save
			groupIds = invoice.granted_group_ids.split(',')
			groupIds.each do |groupId|
				groupId = groupId.to_i
				# http://stackoverflow.com/a/25274645/254475
				groupUser = GroupUser.find_by(user_id: current_user.id, group_id: groupId)
				if groupUser.nil?
					group = Group.find_by(id: groupId.to_i)
					groupUser = GroupUser.new
					groupUser.user = current_user
					groupUser.group = group
					groupUser.save
				end
			end
			Airbrake.notify(
				:error_message => '[success] payment_request',
				:error_class => 'plans#success',
				:parameters => {payment_request: payment_request.inspect}
			)
			Airbrake.notify(
				:error_message => '[success] response',
				:error_class => 'plans#success',
				:parameters => {response: response.inspect}
			)
			Airbrake.notify(
				:error_message => '[success] response.payment_info',
				:error_class => 'plans#success',
				:parameters => {payment_info: response.payment_info}
			)
			#redirect_to "#{Discourse.base_url}"
			redirect_to "#{Discourse.base_url}/users/#{current_user.username}"
		end
		private
		def paypal_express_request
			prefix = sandbox? ? 'Sandbox_' : ''
			Paypal::Express::Request.new(
				:username => SiteSetting.send("«PayPal»_#{prefix}API_Username"),
				:password => SiteSetting.send("«PayPal»_#{prefix}API_Password"),
				:signature => SiteSetting.send("«PayPal»_#{prefix}Signature")
			)
		end
		def paypal_set_sandbox_mode_if_needed
			Paypal.sandbox= sandbox?
			Airbrake.notify(:error_message => sandbox? ? 'SANDBOX MODE' : 'PRODUCTION MODE')
		end
		def sandbox?
			'sandbox' == SiteSetting.send('«PayPal»_Mode')
		end
	end
end

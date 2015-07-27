export default Ember.ArrayController.extend({
	_init: function() {
		//console.log('ArrayController init');
		this.set('filterMode', 'plans');
	}.on('init')
	,navItems: function() {
		return Discourse.NavItem.buildList(null, {filterMode: this.get('filterMode')});
	}.property('filterMode')
	, textAbove: Discourse.Markdown.cook(Discourse.SiteSettings['«Paid_Membership»_Text_Above'])
});
